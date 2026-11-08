import test from "node:test";
import assert from "node:assert/strict";
import {
  databricksConfig,
  databricksLoad,
  databricksSave,
  runSql,
} from "../lib/databricks.ts";
import * as helper from "./helpers/fake-databricks.mjs";

type Fake = {
  db: { row: { revision: number; payload: string }; statements: string[] };
  fetcher: typeof fetch;
};
const fakeDatabricks = (helper as unknown as {
  fakeDatabricks: (options: Record<string, unknown>) => Fake;
}).fakeDatabricks;

const host = "https://dbc-fictional.cloud.databricks.com";
const token = "fictional-databricks-token";
const warehouseId = "fictional-warehouse";
const config = (fetcher: typeof fetch) => ({
  host,
  token,
  warehouseId,
  table: "workspace.default.kincard_households",
  fetcher,
});

test("Databricks settings: none means local DB, partial is a clear error, host is normalized", () => {
  assert.equal(databricksConfig({}), null);
  assert.throws(() => databricksConfig({ DATABRICKS_HOST: "x.cloud.databricks.com" }), /partly configured/);
  const c = databricksConfig({
    DATABRICKS_HOST: "https://dbc-fictional.cloud.databricks.com/",
    DATABRICKS_TOKEN: token,
    DATABRICKS_WAREHOUSE_ID: warehouseId,
  })!;
  assert.equal(c.host, host);
  assert.equal(c.table, "kincard_households");
  assert.throws(
    () =>
      databricksConfig({
        DATABRICKS_HOST: host,
        DATABRICKS_TOKEN: token,
        DATABRICKS_WAREHOUSE_ID: warehouseId,
        DATABRICKS_TABLE: "x; DROP TABLE y",
      }),
    /table name/,
  );
});

test("first load creates the table and seeds the card; later loads read it back", async () => {
  const fake = fakeDatabricks({ host, token, warehouseId });
  const seed = () => ({ revision: 1, updatedAt: "t0", hello: "Maggie" });
  const first = JSON.parse(await databricksLoad(config(fake.fetcher), seed));
  assert.equal(first.hello, "Maggie");
  assert.ok(fake.db.statements.some((s: string) => /^CREATE TABLE IF NOT EXISTS workspace\.default\.kincard_households/.test(s)));
  const again = JSON.parse(await databricksLoad(config(fake.fetcher), () => assert.fail("no reseed")));
  assert.equal(again.revision, 1);
});

test("saves are optimistic: a stale revision is refused, nothing is overwritten", async () => {
  const fake = fakeDatabricks({ host, token, warehouseId });
  const c = config(fake.fetcher);
  await databricksLoad(c, () => ({ revision: 1, updatedAt: "t0" }));
  assert.equal(await databricksSave(c, { revision: 2, updatedAt: "t1" }, 1), true);
  assert.equal(fake.db.row.revision, 2);
  assert.equal(await databricksSave(c, { revision: 2, updatedAt: "t2" }, 1), false);
  assert.equal(JSON.parse(fake.db.row.payload).updatedAt, "t1");
});

test("a slow (starting) warehouse is polled until the result is ready", async () => {
  const fake = fakeDatabricks({ host, token, warehouseId, pendingFirst: true });
  const result = await runSql(config(fake.fetcher), "SELECT payload FROM t WHERE id = :id LIMIT 1", [
    { name: "id", value: "demo" },
  ]);
  assert.deepEqual(result.rows, []);
});

test("bad token or warehouse gives a clear message and never leaks the token", async () => {
  const fake = fakeDatabricks({ host, token, warehouseId });
  await assert.rejects(
    runSql({ ...config(fake.fetcher), token: "wrong" }, "SELECT 1"),
    (e: Error) => /access token/.test(e.message) && !e.message.includes("wrong"),
  );
  await assert.rejects(
    runSql({ ...config(fake.fetcher), warehouseId: "nope" }, "SELECT 1"),
    /warehouse/,
  );
  await assert.rejects(
    runSql(config(async () => { throw new Error("offline"); }), "SELECT 1"),
    /could not reach Databricks/,
  );
});
