import { env } from "cloudflare:workers";
import { seedState } from "./domain.ts";
import type { KinState } from "./domain.ts";
import { InputError } from "./validation.ts";
import {
  databricksConfig,
  databricksLoad,
  databricksSave,
} from "./databricks.ts";

type Bindings = {
  DB?: D1Database;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  DATABRICKS_HOST?: string;
  DATABRICKS_TOKEN?: string;
  DATABRICKS_WAREHOUSE_ID?: string;
  DATABRICKS_TABLE?: string;
  DATABRICKS_CATALOG?: string;
  DATABRICKS_SCHEMA?: string;
};
export function bindings(): Bindings {
  return env as Bindings;
}
function database(): D1Database {
  const db = bindings().DB;
  if (!db)
    throw new InputError(
      "Demo database is not configured. Run npm run setup, then restart the app.",
      503,
    );
  return db;
}
/** "databricks" when DATABRICKS_* settings are present, else the local demo DB. */
export function storageMode(): "databricks" | "local" {
  try {
    return databricksConfig(bindings()) ? "databricks" : "local";
  } catch {
    return "databricks";
  }
}
export async function loadState(): Promise<KinState> {
  const remote = databricksConfig(bindings());
  if (remote)
    return JSON.parse(await databricksLoad(remote, seedState)) as KinState;
  const db = database();
  try {
    let row = await db
      .prepare("SELECT payload FROM households WHERE id = ?")
      .bind("demo")
      .first<{ payload: string }>();
    if (!row) {
      const state = seedState();
      await db
        .prepare(
          "INSERT OR IGNORE INTO households (id, revision, payload) VALUES (?, ?, ?)",
        )
        .bind("demo", state.revision, JSON.stringify(state))
        .run();
      row = await db
        .prepare("SELECT payload FROM households WHERE id = ?")
        .bind("demo")
        .first<{ payload: string }>();
    }
    if (!row) throw new Error("Missing demo row");
    return JSON.parse(row.payload) as KinState;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(
      "The demo database needs setup. Stop the server, run npm run setup, then start it again.",
      503,
    );
  }
}
export async function saveState(
  state: KinState,
  expectedRevision: number,
): Promise<KinState> {
  const next = {
    ...state,
    revision: expectedRevision + 1,
    updatedAt: new Date().toISOString(),
  };
  const remote = databricksConfig(bindings());
  if (remote) {
    if (!(await databricksSave(remote, next, expectedRevision)))
      throw new InputError(
        "The demo changed in another tab. Refresh and review the latest version before trying again.",
        409,
      );
    return next;
  }
  const result = await database()
    .prepare(
      "UPDATE households SET payload = ?, revision = ? WHERE id = ? AND revision = ?",
    )
    .bind(JSON.stringify(next), next.revision, "demo", expectedRevision)
    .run();
  if (!result.meta.changes)
    throw new InputError(
      "The demo changed in another tab. Refresh and review the latest version before trying again.",
      409,
    );
  return next;
}
