import { InputError } from "./validation.ts";

// Databricks storage for KinCard, over plain HTTPS.
// The Cloudflare runtime cannot run Databricks' Node.js SQL driver, so this
// uses the Databricks SQL Statement Execution REST API (POST
// /api/2.0/sql/statements/), which works anywhere fetch works.
// Table: one row per household: id STRING, revision BIGINT, payload STRING (JSON).

export type DatabricksConfig = {
  host: string; // https://dbc-xxxx.cloud.databricks.com
  token: string; // personal access token (server-side only)
  warehouseId: string; // SQL warehouse ID
  table: string; // e.g. workspace.default.kincard_households
  catalog?: string;
  schema?: string;
  fetcher?: typeof fetch;
};

type Param = { name: string; value: string | null; type?: string };
type StatementResponse = {
  statement_id?: string;
  status?: { state?: string; error?: { message?: string; error_code?: string } };
  manifest?: { schema?: { columns?: { name?: string }[] } };
  result?: { data_array?: (string | null)[][] };
};
export type SqlResult = { columns: string[]; rows: (string | null)[][] };

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELED", "CLOSED"]);
const IDENTIFIER = /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*){0,2}$/;

export function databricksConfig(env: Record<string, unknown>): DatabricksConfig | null {
  const get = (name: string) =>
    typeof env[name] === "string" ? (env[name] as string).trim() : "";
  // Accepts the names Databricks shows in Connection details, too.
  const host = get("DATABRICKS_HOST") || get("DATABRICKS_SERVER_HOSTNAME");
  const token = get("DATABRICKS_TOKEN");
  const warehouseId =
    get("DATABRICKS_WAREHOUSE_ID") ||
    get("DATABRICKS_HTTP_PATH").split("/").filter(Boolean).pop() ||
    "";
  if (!host || !token || !warehouseId) return null; // not configured: local storage
  const normalizedHost = `https://${host.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
  if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(normalizedHost))
    throw new InputError(
      "DATABRICKS_HOST should look like dbc-xxxx.cloud.databricks.com. Update .env.local and restart KinCard.",
      503,
    );
  const table = get("DATABRICKS_TABLE") || "kincard_households";
  if (!IDENTIFIER.test(table))
    throw new InputError(
      "DATABRICKS_TABLE must be a table name like workspace.default.kincard_households.",
      503,
    );
  const catalog = get("DATABRICKS_CATALOG") || undefined;
  const schema = get("DATABRICKS_SCHEMA") || undefined;
  for (const value of [catalog, schema])
    if (value && !/^[A-Za-z_]\w*$/.test(value))
      throw new InputError(
        "DATABRICKS_CATALOG and DATABRICKS_SCHEMA must be plain names.",
        503,
      );
  return { host: normalizedHost, token, warehouseId, table, catalog, schema };
}

function failure(status: number, message = ""): InputError {
  if (status === 401 || status === 403)
    return new InputError(
      "Databricks rejected the access token. Check DATABRICKS_TOKEN and its permissions on the SQL warehouse, then restart KinCard.",
      503,
    );
  if (status === 404)
    return new InputError(
      "Databricks could not find that workspace or warehouse. Check DATABRICKS_HOST and DATABRICKS_WAREHOUSE_ID.",
      503,
    );
  if (/TABLE_OR_VIEW_NOT_FOUND|SCHEMA_NOT_FOUND|CATALOG_NOT_FOUND/i.test(message))
    return new InputError(
      "Databricks could not find the KinCard table's catalog or schema. Check DATABRICKS_TABLE (for example workspace.default.kincard_households).",
      503,
    );
  if (/PERMISSION|INSUFFICIENT_PRIVILEGES|not authorized/i.test(message))
    return new InputError(
      "The Databricks token does not have permission to use the KinCard table. Ask the workspace owner to grant access.",
      503,
    );
  return new InputError(
    "Databricks could not complete this request. Check the SQL warehouse is running, then try again.",
    503,
  );
}

/** Run one SQL statement and wait for the result. Never exposes the token. */
export async function runSql(
  config: DatabricksConfig,
  statement: string,
  parameters: Param[] = [],
): Promise<SqlResult> {
  const call = config.fetcher || fetch;
  const headers = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };
  const deadline = Date.now() + 90_000; // allows a cold serverless warehouse to start
  let body: StatementResponse;
  try {
    const response = await call(`${config.host}/api/2.0/sql/statements/`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        warehouse_id: config.warehouseId,
        statement,
        parameters,
        wait_timeout: "30s",
        on_wait_timeout: "CONTINUE",
        format: "JSON_ARRAY",
        disposition: "INLINE",
        ...(config.catalog ? { catalog: config.catalog } : {}),
        ...(config.schema ? { schema: config.schema } : {}),
      }),
    });
    if (!response.ok) throw failure(response.status);
    body = (await response.json()) as StatementResponse;
    while (!TERMINAL.has(body.status?.state || "") && body.statement_id) {
      if (Date.now() > deadline)
        throw new InputError(
          "Databricks took too long. The SQL warehouse may be starting up; wait a minute and try again.",
          504,
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const poll = await call(
        `${config.host}/api/2.0/sql/statements/${encodeURIComponent(body.statement_id)}`,
        { headers, signal: AbortSignal.timeout(30_000) },
      );
      if (!poll.ok) throw failure(poll.status);
      body = (await poll.json()) as StatementResponse;
    }
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(
      "KinCard could not reach Databricks. Check DATABRICKS_HOST and the internet connection.",
      503,
    );
  }
  if (body.status?.state !== "SUCCEEDED")
    throw failure(200, `${body.status?.error?.error_code || ""} ${body.status?.error?.message || ""}`);
  return {
    columns: (body.manifest?.schema?.columns || []).map((c) => c.name || ""),
    rows: body.result?.data_array || [],
  };
}

const ready = new Set<string>();
async function ensureTable(config: DatabricksConfig) {
  const key = `${config.host}|${config.table}`;
  if (ready.has(key)) return;
  await runSql(
    config,
    `CREATE TABLE IF NOT EXISTS ${config.table} (id STRING, revision BIGINT, payload STRING)`,
  );
  ready.add(key);
}

export async function databricksLoad(
  config: DatabricksConfig,
  seed: () => unknown,
  id = "demo",
): Promise<string> {
  await ensureTable(config);
  const select = () =>
    runSql(config, `SELECT payload FROM ${config.table} WHERE id = :id LIMIT 1`, [
      { name: "id", value: id },
    ]);
  let found = await select();
  if (!found.rows.length) {
    const state = seed() as { revision: number };
    await runSql(
      config,
      `INSERT INTO ${config.table} (id, revision, payload) SELECT :id, :revision, :payload WHERE NOT EXISTS (SELECT 1 FROM ${config.table} WHERE id = :id)`,
      [
        { name: "id", value: id },
        { name: "revision", value: String(state.revision), type: "BIGINT" },
        { name: "payload", value: JSON.stringify(state) },
      ],
    );
    found = await select();
  }
  const payload = found.rows[0]?.[0];
  if (!payload) throw new InputError("Databricks returned no KinCard data.", 503);
  return payload;
}

/** Optimistic save: only writes if nobody else saved since we loaded. */
export async function databricksSave(
  config: DatabricksConfig,
  next: { revision: number; updatedAt: string },
  expectedRevision: number,
  id = "demo",
): Promise<boolean> {
  await ensureTable(config);
  const update = await runSql(
    config,
    `UPDATE ${config.table} SET payload = :payload, revision = :next WHERE id = :id AND revision = :expected`,
    [
      { name: "payload", value: JSON.stringify(next) },
      { name: "next", value: String(next.revision), type: "BIGINT" },
      { name: "id", value: id },
      { name: "expected", value: String(expectedRevision), type: "BIGINT" },
    ],
  );
  const affected = update.columns.indexOf("num_affected_rows");
  if (affected >= 0 && update.rows[0]?.[affected] === "0") return false;
  // Confirm by reading back (works whatever the UPDATE result looks like).
  const check = await runSql(
    config,
    `SELECT revision, payload FROM ${config.table} WHERE id = :id LIMIT 1`,
    [{ name: "id", value: id }],
  );
  const [revision, payload] = check.rows[0] || [];
  if (Number(revision) !== next.revision || !payload) return false;
  try {
    return (JSON.parse(payload) as { updatedAt?: string }).updatedAt === next.updatedAt;
  } catch {
    return false;
  }
}
