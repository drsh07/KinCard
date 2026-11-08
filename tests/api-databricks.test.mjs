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

test("the visit log records each care event in Databricks, privacy-screened, with no names", async () => {
  fake.db.events.length = 0;
  let state = await request("state");
  // A visitor leaves a note (with a phone number that must be screened out).
  const note = await request(`care/${state.qrToken}/notes`, {
    author: "Alex Visitor",
    text: "Maggie smiled at her garden photos today. Call 604-555-0199.",
  }, 201);
  const visit = fake.db.events.find((e) => e.event_type === "visitor_note");
  assert.ok(visit, "visitor note logged");
  assert.equal(visit.source, "visitor");
  assert.match(visit.note, /garden photos/);
  assert.ok(!visit.note.includes("604-555-0199"), "phone number screened out");
  assert.ok(!JSON.stringify(fake.db.events).includes("Alex Visitor"), "no visitor names");
  assert.match(visit.at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

  // The family approves the suggested update.
  state = await request("state");
  await request(`suggestions/${note.suggestion.id}`, {
    decision: "approved",
    revision: state.revision,
  });
  const approved = fake.db.events.find((e) => e.event_type === "observation_approved");
  assert.ok(approved.section, "section label logged");
  assert.match(approved.note, /garden photos/);

  // A family story is approved: one row per section that grew; names never logged.
  state = await request("state");
  const generated = await request("generate", {
    story: "She has started knitting scarves.",
    privacyReviewed: true,
    relationship: "Daughter",
    terms: false,
    revision: state.revision,
  });
  await request("approve-profile", {
    profile: generated.profile,
    revision: generated.state.revision,
  });
  const story = fake.db.events.filter((e) => e.event_type === "family_story");
  assert.ok(story.length >= 1);
  assert.ok(story.some((e) => /knitting/.test(e.note)));
  assert.ok(!JSON.stringify(fake.db.events).includes("Margaret Morgan"), "legal name never logged");
  assert.ok(fake.db.events.every((e) => e.household === "demo"));
});
