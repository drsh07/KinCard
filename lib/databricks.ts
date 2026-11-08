import { InputError } from "./validation.ts";

export type DatabricksConfig = {
  host: string;
  token: string;
  warehouseId: string;
  table: string;
  catalog?: string;
  schema?: string;
};

const IDENTIFIER = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;

export function databricksConfig(
  env: Record<string, unknown>,
): DatabricksConfig | null {
  const get = (name: string) =>
    typeof env[name] === "string" ? (env[name] as string).trim() : "";

  // Support both standard env keys and Databricks UI copy-paste keys
  const rawHost = get("DATABRICKS_HOST") || get("DATABRICKS_SERVER_HOSTNAME");
  const token = get("DATABRICKS_TOKEN");
  
  // Extract warehouse ID from DATABRICKS_WAREHOUSE_ID or parse DATABRICKS_HTTP_PATH (/sql/1.0/warehouses/XXXXX)
  let warehouseId = get("DATABRICKS_WAREHOUSE_ID");
  const httpPath = get("DATABRICKS_HTTP_PATH");
  if (!warehouseId && httpPath) {
    warehouseId = httpPath.split("/").pop() || "";
  }

  if (!rawHost || !token || !warehouseId) {
    const missing = [];
    if (!rawHost) missing.push("DATABRICKS_HOST / DATABRICKS_SERVER_HOSTNAME");
    if (!token) missing.push("DATABRICKS_TOKEN");
    if (!warehouseId) missing.push("DATABRICKS_WAREHOUSE_ID / DATABRICKS_HTTP_PATH");
    console.log(`[Databricks] Missing keys: ${missing.join(", ")} — using local storage.`);
    return null;
  }

  const normalizedHost = `https://${rawHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
  const table = get("DATABRICKS_TABLE") || "kincard_households";
  const catalog = get("DATABRICKS_CATALOG") || undefined;
  const schema = get("DATABRICKS_SCHEMA") || undefined;

  console.log(`[Databricks] Connected to ${normalizedHost} (Warehouse ID: ${warehouseId})`);
  return { host: normalizedHost, token, warehouseId, table, catalog, schema };
}

export async function databricksLoad(
  config: DatabricksConfig,
  seed: () => unknown,
  userId = "demo",
): Promise<string> {
  const statement = `SELECT payload FROM ${config.table} WHERE id = :userId LIMIT 1;`;
  const rows = await sql<{ payload: string }>(config, statement, { userId });
  if (rows[0]?.payload) return rows[0].payload;

  const initial = seed();
  const insert = `INSERT INTO ${config.table} (id, revision, payload) VALUES (:userId, 1, :payload);`; await sql(config, insert, { userId, payload: JSON.stringify(initial), }); return JSON.stringify(initial); }  export async function databricksSave( config: DatabricksConfig, state: unknown, expectedRevision: number, userId = "demo", ): Promise<boolean> { const statement = `UPDATE ${config.table} SET payload = :payload, revision = :nextRev WHERE id = :userId AND revision = :expectedRev;`;
  const result = await sqlExec(config, statement, {
    payload: JSON.stringify(state),
    nextRev: expectedRevision + 1,
    userId,
    expectedRev: expectedRevision,
  });
  return result.affectedRows > 0;
}

async function sql<T>(
  config: DatabricksConfig,
  statement: string,
  parameters: Record<string, unknown>,
): Promise<T[]> {
  const data = await execute(config, statement, parameters);
  const columns =
    (data.manifest?.schema?.columns as Array<{ name: string }>) || [];
  const rows = (data.result?.data_array as Array<Array<unknown>>) || [];
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((col, idx) => [col.name, row[idx]]),
    ),
  ) as T[];
}

async function sqlExec(
  config: DatabricksConfig,
  statement: string,
  parameters: Record<string, unknown>,
): Promise<{ affectedRows: number }> {
  const data = await execute(config, statement, parameters);
  return {
    affectedRows: Number(data.result?.affected_row_count ?? 0),
  };
}

async function execute(
  config: DatabricksConfig,
  statement: string,
  parameters: Record<string, unknown>,
): Promise<{
  manifest?: { schema?: { columns?: Array<{ name: string }> } };
  result?: { data_array?: Array<Array<unknown>>; affected_row_count?: number };
}> {
  const body: Record<string, unknown> = {
    statement,
    warehouse_id: config.warehouseId,
    wait_timeout: "30s",
    parameters: Object.entries(parameters).map(([name, value]) => ({
      name,
      value: String(value),
    })),
  };
  if (config.catalog) body.catalog = config.catalog;
  if (config.schema) body.schema = config.schema;

  const response = await fetch(
    `${config.host}/api/2.0/sql/statements`, { method: "POST", headers: { Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new InputError(
      `Databricks query failed with status ${response.status}.`,
      500,
    );
  }

  return (await response.json()) as {
    manifest?: { schema?: { columns?: Array<{ name: string }> } };
    result?: { data_array?: Array<Array<unknown>>; affected_row_count?: number };
  };
}