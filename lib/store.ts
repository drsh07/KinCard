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
  AUTH0_SECRET?: string;
  APP_BASE_URL?: string;
  AUTH0_DOMAIN?: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_CLIENT_SECRET?: string;
};

// In-memory fallback state map for local Node execution when D1/Databricks aren't bound
const localMemoryStore = new Map<string, KinState>();

export function bindings(): Bindings {
  let cfEnv: Record<string, unknown> = {};
  try {
    const cf = require("cloudflare:workers");
    if (cf?.env) cfEnv = cf.env;
  } catch {}

  const processEnv = typeof process !== "undefined" && process.env ? process.env : {};

  return {
    ...cfEnv,
    ...processEnv,
  } as Bindings;
}

export function storageMode(): "databricks" | "local" {
  try {
    return databricksConfig(bindings()) ? "databricks" : "local";
  } catch {
    return "local";
  }
}

export async function loadState(userId: string = "demo"): Promise<KinState> {
  const envVars = bindings();
  const remote = databricksConfig(envVars);
  
  // 1. Try Databricks if configured
  if (remote) {
    return JSON.parse(await databricksLoad(remote, seedState, userId)) as KinState;
  }
  
  // 2. Try Cloudflare D1 Database if bound
  const db = envVars.DB;
  if (db) {
    try {
      let row = await db
        .prepare("SELECT payload FROM households WHERE id = ?")
        .bind(userId)
        .first<{ payload: string }>();

      if (!row) {
        const state = seedState();
        await db
          .prepare(
            "INSERT OR IGNORE INTO households (id, revision, payload) VALUES (?, ?, ?)",
          )
          .bind(userId, state.revision, JSON.stringify(state))
          .run();
        row = await db
          .prepare("SELECT payload FROM households WHERE id = ?")
          .bind(userId)
          .first<{ payload: string }>();
      }
      if (row) return JSON.parse(row.payload) as KinState;
    } catch {}
  }

  // 3. Fallback to in-memory store for local Node/Vinext development
  if (!localMemoryStore.has(userId)) {
    localMemoryStore.set(userId, seedState());
  }
  return localMemoryStore.get(userId)!;
}

export async function saveState(
  state: KinState,
  expectedRevision: number,
  userId: string = "demo",
): Promise<KinState> {
  const next = {
    ...state,
    revision: expectedRevision + 1,
    updatedAt: new Date().toISOString(),
  };

  const envVars = bindings();
  const remote = databricksConfig(envVars);
  
  // 1. Save to Databricks if configured
  if (remote) {
    if (!(await databricksSave(remote, next, expectedRevision, userId)))
      throw new InputError(
        "The household state changed in another session. Refresh and review the latest version.",
        409,
      );
    return next;
  }

  // 2. Save to Cloudflare D1 if bound
  const db = envVars.DB;
  if (db) {
    const result = await db
      .prepare(
        "UPDATE households SET payload = ?, revision = ? WHERE id = ? AND revision = ?",
      )
      .bind(JSON.stringify(next), next.revision, userId, expectedRevision)
      .run();

    if (result.meta.changes) return next;
  }

  // 3. Save to in-memory store for local Node development
  localMemoryStore.set(userId, next);
  return next;
}