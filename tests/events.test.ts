import test from "node:test";
import assert from "node:assert/strict";
import { eventsTable, logEvents } from "../lib/events.ts";
import * as helper from "./helpers/fake-databricks.mjs";

const fakeDatabricks = (helper as unknown as {
  fakeDatabricks: (o: Record<string, unknown>) => {
    db: { events: Record<string, string>[] };
    fetcher: typeof fetch;
  };
}).fakeDatabricks;
const host = "https://dbc-fictional.cloud.databricks.com";
const env = {
  DATABRICKS_HOST: host,
  DATABRICKS_TOKEN: "fictional-token",
  DATABRICKS_WAREHOUSE_ID: "wh",
  DATABRICKS_TABLE: "workspace.default.kincard_households",
};

test("visit log table sits next to the card table", () => {
  const config = { host, token: "t", warehouseId: "w", table: "workspace.default.kincard_households" };
  assert.equal(eventsTable(config), "workspace.default.kincard_events");
  assert.equal(eventsTable({ ...config, table: "kincard_households" }), "kincard_events");
  assert.equal(eventsTable(config, "main.care.visits"), "main.care.visits");
});

test("without Databricks, nothing is logged and nothing breaks", async () => {
  assert.equal(await logEvents({}, [{ type: "visitor_note", note: "x" }]), false);
});

test("a Databricks failure never breaks the app", async () => {
  const fake = fakeDatabricks({ host, token: "fictional-token", warehouseId: "wh", failEvents: true });
  const realFetch = globalThis.fetch;
  globalThis.fetch = fake.fetcher;
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await logEvents(env, [{ type: "visitor_note", note: "x" }]), false);
  } finally {
    globalThis.fetch = realFetch;
    console.warn = warn;
  }
});

test("several events go in one insert", async () => {
  const fake = fakeDatabricks({ host, token: "fictional-token", warehouseId: "wh" });
  const realFetch = globalThis.fetch;
  globalThis.fetch = fake.fetcher;
  try {
    assert.equal(
      await logEvents(env, [
        { type: "family_story", field: "conversation", note: "Loves classic cars." },
        { type: "family_story", field: "avoid", note: "Hates loud chewing." },
      ]),
      true,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(
    fake.db.events.map((e) => [e.event_type, e.section, e.source]),
    [
      ["family_story", "Let's talk about", "family"],
      ["family_story", "Please keep in mind", "family"],
    ],
  );
});
