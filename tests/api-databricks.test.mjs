import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fakeDatabricks } from "./helpers/fake-databricks.mjs";

// The full API with Databricks storage and NO local Cloudflare database.
const host = "https://dbc-fictional.cloud.databricks.com";
const token = "fictional-databricks-token";
const warehouseId = "fictional-warehouse";
const fake = fakeDatabricks({ host, token, warehouseId });
const realFetch = globalThis.fetch;
globalThis.fetch = fake.fetcher;
globalThis.__kinCardApiTestBindings = {
  DB: undefined,
  GEMINI_API_KEY: "",
  DATABRICKS_HOST: "dbc-fictional.cloud.databricks.com",
  DATABRICKS_TOKEN: token,
  DATABRICKS_WAREHOUSE_ID: warehouseId,
  DATABRICKS_TABLE: "workspace.default.kincard_households",
};
register("./helpers/cloudflare-loader.mjs", import.meta.url);
const api = await import("../app/api/[...path]/route.ts");
after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.__kinCardApiTestBindings;
});

let cookie = "";
async function request(path, payload, expected = 200) {
  const response = await api[payload === undefined ? "GET" : "POST"](
    new Request(`https://kincard.example/api/${path}`, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(payload === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }),
  );
  const json = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(json)}`);
  assert.ok(!JSON.stringify(json).includes(token), "never expose the Databricks token");
  if (path === "login") cookie = response.headers.get("set-cookie").split(";")[0];
  return json;
}

test("KinCard runs fully on Databricks: load, add a story, approve, and the card grows", async () => {
  await request("login", { username: "family", password: "KinCard2026!" });
  const status = await request("ai/status");
  assert.equal(status.storage, "databricks");
  const initial = await request("state");
  assert.equal(initial.profile.preferredName, "Maggie");
  assert.ok(fake.db.row, "seeded into Databricks");

  const generated = await request("generate", {
    story: "She also loves classic cars.",
    privacyReviewed: true,
    relationship: "Daughter",
    terms: false,
    revision: initial.revision,
  });
  assert.ok(generated.profile.conversation.startsWith(initial.profile.conversation));
  const approved = (
    await request("approve-profile", {
      profile: generated.profile,
      revision: generated.state.revision,
    })
  ).state;
  assert.match(approved.profile.conversation, /classic cars/);

  // Read straight from "Databricks": the saved card has old + new.
  const stored = JSON.parse(fake.db.row.payload);
  assert.match(stored.profile.conversation, /garden/);
  assert.match(stored.profile.conversation, /classic cars/);
  assert.equal(stored.history[0].source, "family story");

  // A stale tab cannot overwrite it.
  await request(
    "approve-profile",
    { profile: initial.profile, revision: initial.revision },
    409,
  );
  assert.match(JSON.parse(fake.db.row.payload).profile.conversation, /classic cars/);
});
