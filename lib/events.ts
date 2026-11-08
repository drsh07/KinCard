import { databricksConfig, runSql } from "./databricks.ts";
import type { DatabricksConfig } from "./databricks.ts";
import { FIELD_LABELS } from "./domain.ts";
import type { ProfileField } from "./domain.ts";

// The visit log: one row per care event, written to Databricks so the care
// team can analyse visits with Databricks AI/BI dashboards and Genie.
// Only privacy-screened text is logged. No visitor names, no account data.
// Logging never blocks or breaks the app: failures are swallowed.

export type CareEventType =
  | "visitor_note"
  | "observation_approved"
  | "observation_rejected"
  | "family_story"
  | "family_edit";

export type CareEvent = {
  type: CareEventType;
  field?: ProfileField | null;
  note?: string;
};

const NOTE_MAX = 2000;
const ready = new Set<string>();

/** Same catalog and schema as the card table, e.g.
 * workspace.default.kincard_households -> workspace.default.kincard_events */
export function eventsTable(config: DatabricksConfig, override?: string) {
  const name = (override || "").trim();
  if (name && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*){0,2}$/.test(name)) return name;
  return config.table.includes(".")
    ? config.table.replace(/[^.]+$/, "kincard_events")
    : "kincard_events";
}

const sqlTime = (iso: string) => iso.replace("T", " ").replace(/Z$/, "").slice(0, 23);

export async function logEvents(
  env: Record<string, unknown>,
  events: CareEvent[],
  household = "demo",
): Promise<boolean> {
  if (!events.length) return false;
  let config: DatabricksConfig | null;
  try {
    config = databricksConfig(env);
  } catch {
    return false;
  }
  if (!config) return false; // local demo DB: no visit log
  try {
    const table = eventsTable(
      config,
      typeof env.DATABRICKS_EVENTS_TABLE === "string" ? env.DATABRICKS_EVENTS_TABLE : "",
    );
    const key = `${config.host}|${table}`;
    if (!ready.has(key)) {
      await runSql(
        config,
        `CREATE TABLE IF NOT EXISTS ${table} (id STRING, at TIMESTAMP, household STRING, event_type STRING, section STRING, note STRING, source STRING) COMMENT 'KinCard visit log: one row per care event. Privacy-screened text only.'`,
      );
      ready.add(key);
    }
    const at = sqlTime(new Date().toISOString());
    const params: { name: string; value: string | null }[] = [];
    const rows = events.map((event, i) => {
      params.push(
        { name: `id${i}`, value: crypto.randomUUID() },
        { name: `at${i}`, value: at },
        { name: `household${i}`, value: household },
        { name: `type${i}`, value: event.type },
        { name: `section${i}`, value: event.field ? FIELD_LABELS[event.field] : null },
        { name: `note${i}`, value: (event.note || "").slice(0, NOTE_MAX) || null },
        {
          name: `source${i}`,
          value: event.type.startsWith("family") ? "family" : "visitor",
        },
      );
      return `(:id${i}, CAST(:at${i} AS TIMESTAMP), :household${i}, :type${i}, :section${i}, :note${i}, :source${i})`;
    });
    await runSql(
      config,
      `INSERT INTO ${table} (id, at, household, event_type, section, note, source) VALUES ${rows.join(", ")}`,
      params,
    );
    return true;
  } catch {
    console.warn("KinCard: could not write to the Databricks visit log.");
    return false;
  }
}
