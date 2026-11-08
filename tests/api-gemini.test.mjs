import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { PROFILE_FIELDS } from "../lib/domain.ts";

// Exercise the real API handlers with fictional Worker bindings and a strictly
// mocked Google transport. No configurable production API host or real key is
// required, and an unexpected network destination fails the test immediately.
const TEST_KEY = "fictional-api-integration-key";
const MODEL = "gemini-3.8-flash";
const realFetch = globalThis.fetch;
class MemoryD1 {
  payload = null;
  revision = null;
  prepare(sql) {
    const database = this;
    let values = [];
    return {
      bind(...parameters) {
        values = parameters;
        return this;
      },
      async first() {
        assert.match(sql, /^SELECT payload FROM households/);
        assert.equal(values[0], "demo");
        return database.payload === null ? null : { payload: database.payload };
      },
      async run() {
        if (sql.startsWith("INSERT OR IGNORE INTO households")) {
          assert.equal(values[0], "demo");
          if (database.payload === null) {
            database.revision = values[1];
            database.payload = values[2];
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        assert.match(sql, /^UPDATE households SET payload/);
        assert.equal(values[2], "demo");
        if (database.revision !== values[3]) return { meta: { changes: 0 } };
        database.payload = values[0];
        database.revision = values[1];
        return { meta: { changes: 1 } };
      },
    };
  }
  reset() {
    this.payload = this.revision = null;
  }
}
const database = new MemoryD1();
const bindings = {
  DB: database,
  GEMINI_API_KEY: TEST_KEY,
  GEMINI_MODEL: MODEL,
};
globalThis.__kinCardApiTestBindings = bindings;
register("./helpers/cloudflare-loader.mjs", import.meta.url);
const apiRoute = await import("../app/api/[...path]/route.ts");
const translationRoute = await import(
  "../app/api/care/[token]/translate/route.ts"
);
let cookie = "";
let provider;
let calls = [];

const storyUnits = [
  "Her name is Jordan Sample.",
  "Please call her Jo.",
  "She worked as a librarian.",
  "She enjoys talking about birds.",
  "A quiet room helps her feel comfortable.",
  "Loud TV upsets her.",
  "She likes tea after lunch.",
  "Speak slowly and give her time to answer.",
  "Family reports hearing difficulty.",
  "Family visits on Sundays.",
];
const story = storyUnits.join(" ");
function narrativeOutput() {
  const values = ["Jordan Sample", "Jo", ...storyUnits.slice(2)];
  return Object.fromEntries(
    PROFILE_FIELDS.map((field, index) => [
      field,
      {
        value: values[index],
        evidence: [index],
        uncertain: false,
      },
    ]),
  );
}
function translateOutput(data) {
  const convert = (value) => (value ? `Français : ${value}` : "");
  const map = (value) =>
    Object.fromEntries(
      Object.entries(value).map(([key, text]) => [key, convert(text)]),
    );
  return {
    fields: map(data.fields),
    labels: map(data.labels),
    copy: map(data.copy),
    uncertainties: data.uncertainties.map(convert),
  };
}
function envelope(value) {
  return Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(value) }] },
      },
    ],
  });
}
function success(data, body) {
  if (body.generationConfig.responseJsonSchema.properties.ok)
    return envelope({ ok: true });
  if (data.story) return envelope(narrativeOutput());
  if (data.answers) return envelope({ ...data.answers, uncertainFields: [] });
  if (data.visitorNote)
    return envelope({ field: "conversation", value: data.visitorNote });
  if (data.fields) return envelope(translateOutput(data));
  if (data.sections)
    return envelope(
      Object.fromEntries(
        Object.entries(data.sections).map(([field, s]) => [
          field,
          `${s.current} ${s.add}`,
        ]),
      ),
    );
  assert.fail("Unexpected Gemini request type");
}
function reset() {
  database.reset();
  cookie = "";
  calls = [];
  bindings.GEMINI_API_KEY = TEST_KEY;
  bindings.GEMINI_MODEL = MODEL;
  provider = success;
  globalThis.fetch = async (url, init) => {
    assert.equal(
      String(url),
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    );
    assert.equal(init.method, "POST");
    assert.equal(new Headers(init.headers).get("x-goog-api-key"), TEST_KEY);
    assert.ok(init.signal, "Provider requests must have a timeout signal");
    assert.ok(!String(url).includes(TEST_KEY));
    assert.ok(!String(init.body).includes(TEST_KEY));
    const body = JSON.parse(String(init.body));
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.ok(body.generationConfig.responseJsonSchema);
    const data = JSON.parse(body.contents[0].parts[0].text);
    calls.push({ data, body });
    return provider(data, body);
  };
}
async function request(path, payload, expected = 200, authenticated = true) {
  const input = new Request(`https://kincard.example/api/${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      ...(authenticated && cookie ? { cookie } : {}),
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const match = /^care\/([^/]+)\/translate$/.exec(path);
  const response = match
    ? await translationRoute.POST(input, {
        params: Promise.resolve({ token: match[1] }),
      })
    : await apiRoute[payload === undefined ? "GET" : "POST"](input);
  const json = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(json)}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(
    !JSON.stringify(json).includes(TEST_KEY),
    "API responses must not expose the key",
  );
  if (path === "login")
    cookie = response.headers.get("set-cookie").split(";")[0];
  return json;
}
async function signIn() {
  await request(
    "login",
    { username: "family", password: "KinCard2026!" },
    200,
    false,
  );
  return request("state");
}
function generationInput(state, overrides = {}) {
  return {
    story,
    privacyReviewed: true,
    relationship: "Grandchild",
    terms: false,
    revision: state.revision,
    ...overrides,
  };
}
after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.__kinCardApiTestBindings;
});

test("configured Gemini API flow generates a draft, publishes only after approval, reviews notes, and translates without replacing English", async () => {
  reset();
  await request("ai/status", undefined, 401, false);
  await request("ai/check", {}, 401, false);
  const initial = await signIn();
  const status = await request("ai/status");
  assert.equal(status.configured, true);
  assert.equal(status.mode, "gemini");
  assert.equal(status.model, MODEL);
  assert.equal(
    calls.length,
    0,
    "Reading configuration must not send patient data or call Gemini",
  );
  const probe = await request("ai/check", {});
  assert.equal(probe.ok, true);
  assert.equal(probe.mode, "gemini");
  assert.equal(probe.model, MODEL);
  assert.ok(
    !JSON.stringify(calls[0].data).includes("Margaret"),
    "Connection checks must use only a minimal probe",
  );

  const generated = await request("generate", generationInput(initial));
  assert.equal(generated.mode, "gemini");
  assert.equal(generated.state.aiMode, "gemini");
  assert.equal(generated.profile.preferredName, "Jo");
  assert.equal(generated.profile.fullName, "Jordan Sample");
  assert.equal(generated.profile.biography, storyUnits[2]);
  assert.equal(generated.profile.health, storyUnits[8]);
  assert.deepEqual(generated.state.draft, generated.profile);
  assert.deepEqual(generated.state.profile, initial.profile);
  assert.deepEqual(
    (await request(`care/${initial.qrToken}`, undefined, 200, false)).profile,
    initial.profile,
  );
  let state = (
    await request("approve-profile", {
      profile: generated.profile,
      revision: generated.state.revision,
    })
  ).state;
  assert.equal(state.draft, null);
  assert.equal(state.profile.preferredName, "Jo");

  const note = await request(
    `care/${state.qrToken}/notes`,
    {
      author: "Alex, fictional visitor",
      text: "Jo smiled while looking at bird photos today. Phone 604-555-0199.",
    },
    201,
    false,
  );
  assert.equal(note.mode, "gemini");
  assert.equal(note.suggestion.status, "pending");
  assert.ok(!note.note.text.includes("604-555-0199"));
  assert.ok(!JSON.stringify(calls.at(-1).data).includes("604-555-0199"));
  state = await request("state");
  assert.ok(!state.profile.conversation.includes("Visitor observation"));
  state = (
    await request(`suggestions/${note.suggestion.id}`, {
      decision: "approved",
      revision: state.revision,
    })
  ).state;
  assert.match(state.profile.conversation, /Visitor observation: Jo smiled/);
  const approved = structuredClone(state.profile);
  const secondNote = await request(
    `care/${state.qrToken}/notes`,
    { author: "Alex", text: "Jo asked to talk about garden photos." },
    201,
    false,
  );
  state = await request("state");
  state = (
    await request(`suggestions/${secondNote.suggestion.id}`, {
      decision: "rejected",
      revision: state.revision,
    })
  ).state;
  assert.deepEqual(state.profile, approved);

  const translation = await request(
    `care/${state.qrToken}/translate`,
    { language: "fr", revision: state.revision },
    200,
    false,
  );
  assert.equal(translation.language, "fr");
  assert.equal(translation.profile.fullName, "Jordan Sample");
  assert.equal(translation.profile.preferredName, "Jo");
  assert.match(translation.profile.conversation, /Français/);
  assert.match(translation.copy.observationQuestion, /Français/);
  assert.match(translation.labels.comfort, /Français/);
  const sent = calls.at(-1).data;
  assert.ok(!("fullName" in sent.fields));
  assert.ok(!("preferredName" in sent.fields));
  assert.ok(!JSON.stringify(sent).includes("Jordan Sample"));
  assert.ok(!/\bJo\b/.test(JSON.stringify(sent)));
  const unchanged = await request("state");
  assert.equal(unchanged.revision, state.revision);
  assert.deepEqual(unchanged.profile, approved);
  assert.deepEqual(
    (await request(`care/${state.qrToken}`, undefined, 200, false)).profile,
    approved,
  );
  // check, story, note, blend of the approved observation, translation, note 2
  assert.equal(calls.length, 6);
  assert.ok(calls.some((call) => call.data.sections?.conversation));
});

const failures = [
  [
    "invalid or unauthorized key",
    502,
    () =>
      Response.json(
        { error: { code: 401, status: "UNAUTHENTICATED", message: TEST_KEY } },
        { status: 401 },
      ),
  ],
  [
    "exhausted quota",
    503,
    () =>
      Response.json(
        {
          error: { code: 429, status: "RESOURCE_EXHAUSTED", message: TEST_KEY },
        },
        { status: 429 },
      ),
  ],
  [
    "timeout",
    504,
    () => {
      throw new DOMException(TEST_KEY, "TimeoutError");
    },
  ],
  [
    "invalid JSON",
    502,
    () =>
      Response.json({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } },
        ],
      }),
  ],
  ["invalid schema", 502, () => envelope({ invented: TEST_KEY })],
  [
    "truncated output",
    502,
    () =>
      Response.json({
        candidates: [
          { finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } },
        ],
      }),
  ],
];
for (const [name, expectedStatus, fail] of failures) {
  test(`configured Gemini ${name} is an explicit error and preserves the approved card and unsaved records`, async () => {
    reset();
    const initial = await signIn();
    const original = database.payload;
    provider = fail;
    const generated = await request(
      "generate",
      generationInput(initial),
      expectedStatus,
    );
    assert.equal(typeof generated.error, "string");
    assert.equal(generated.profile, undefined);
    assert.equal(generated.mode, undefined);
    assert.equal(database.payload, original);
    const note = await request(
      `care/${initial.qrToken}/notes`,
      { author: "Alex", text: "Jo enjoyed talking about garden photos." },
      expectedStatus,
      false,
    );
    assert.equal(typeof note.error, "string");
    assert.equal(
      database.payload,
      original,
      "A failed suggestion must not silently save a duplicate-prone note or mock update",
    );
    const translated = await request(
      `care/${initial.qrToken}/translate`,
      { language: "fr", revision: initial.revision },
      expectedStatus,
      false,
    );
    assert.equal(typeof translated.error, "string");
    assert.equal(database.payload, original);
    assert.deepEqual(
      (await request(`care/${initial.qrToken}`, undefined, 200, false)).profile,
      initial.profile,
    );
    await request("ai/check", {}, expectedStatus);
    assert.equal(
      database.payload,
      original,
      "Connection checks never edit the care card",
    );
  });
}

test("missing key keeps explicitly labelled local generation, with no network calls or fake translations", async () => {
  reset();
  bindings.GEMINI_API_KEY = "";
  const initial = await signIn();
  const status = await request("ai/status");
  assert.equal(status.configured, false);
  assert.equal(status.mode, "mock");
  await request("ai/check", {}, 503);
  const result = await request("generate", generationInput(initial));
  assert.equal(result.mode, "mock");
  assert.match(result.notice, /local|mock/i);
  await request(
    `care/${initial.qrToken}/translate`,
    { language: "fr", revision: result.state.revision },
    503,
    false,
  );
  assert.equal(calls.length, 0);
});

test("configured API rejects unreviewed or detectable private input before calling Gemini", async () => {
  reset();
  const initial = await signIn();
  const original = database.payload;
  await request(
    "generate",
    generationInput(initial, { privacyReviewed: false }),
    400,
  );
  await request(
    "generate",
    generationInput(initial, { story: `${story} Phone 604-555-0199.` }),
    400,
  );
  assert.equal(calls.length, 0);
  assert.equal(database.payload, original);
});

test("a new story about the same person ADDS to the approved card; Gemini sees the card as memory", async () => {
  reset();
  const initial = await signIn();
  const original = structuredClone(initial.profile);
  const addition = (value) =>
    Object.fromEntries(
      PROFILE_FIELDS.map((field) => [
        field,
        field === "conversation"
          ? { value, evidence: [0], uncertain: false }
          : { value: "", evidence: [], uncertain: false },
      ]),
    );
  provider = (data, body) => {
    if (data.story) {
      assert.equal(data.existingCard.preferredName, "Maggie");
      assert.match(body.systemInstruction.parts[0].text, /MEMORY/);
      return envelope(addition(data.story));
    }
    return success(data, body);
  };
  const story = "She also loves classic cars.";
  const generated = await request(
    "generate",
    generationInput(initial, { story }),
  );
  assert.equal(generated.startedNew, false);
  assert.deepEqual(generated.added, ["conversation"]);
  assert.ok(generated.profile.conversation.startsWith(original.conversation));
  assert.match(generated.profile.conversation, /classic cars/);
  for (const field of PROFILE_FIELDS)
    if (field !== "conversation")
      assert.equal(generated.profile[field], original[field], field);
  assert.match(generated.notice, /Everything already on the card was kept/);
  assert.match(generated.notice, /Gemini blended/);
  const blendCall = calls.find((call) => call.data.sections);
  assert.deepEqual(Object.keys(blendCall.data.sections), ["conversation"]);
  assert.equal(blendCall.data.sections.conversation.current, original.conversation);

  const approved = (
    await request("approve-profile", {
      profile: generated.profile,
      revision: generated.state.revision,
    })
  ).state;
  assert.match(approved.profile.conversation, /garden/);
  assert.match(approved.profile.conversation, /classic cars/);
  assert.equal(approved.history[0].source, "family story");
  assert.deepEqual(approved.history[0].fields, ["conversation"]);

  // Telling the same thing again adds nothing and removes nothing.
  const again = await request("generate", generationInput(approved, { story }));
  assert.deepEqual(again.profile.conversation, approved.profile.conversation);
  assert.deepEqual(again.added, []);
  assert.match(again.notice, /already on Maggie's card/);
});

test("a blend that would drop an earlier detail is refused; the plain line is kept", async () => {
  reset();
  const initial = await signIn();
  const original = structuredClone(initial.profile);
  provider = (data, body) => {
    if (data.story)
      return envelope(
        Object.fromEntries(
          PROFILE_FIELDS.map((field) => [
            field,
            field === "conversation"
              ? { value: data.story, evidence: [0], uncertain: false }
              : { value: "", evidence: [], uncertain: false },
          ]),
        ),
      );
    if (data.sections) return envelope({ conversation: "She loves classic cars." });
    return success(data, body);
  };
  const generated = await request(
    "generate",
    generationInput(initial, { story: "She loves classic cars." }),
  );
  assert.equal(
    generated.profile.conversation,
    `${original.conversation}\n\nShe loves classic cars.`,
  );
  assert.doesNotMatch(generated.notice, /Gemini blended/);
});

test("two stories in a row without approving both end up in the draft", async () => {
  reset();
  const initial = await signIn();
  provider = (data, body) => {
    if (data.story)
      return envelope(
        Object.fromEntries(
          PROFILE_FIELDS.map((field) => [
            field,
            field === "biography"
              ? { value: data.story, evidence: [0], uncertain: false }
              : { value: "", evidence: [], uncertain: false },
          ]),
        ),
      );
    return success(data, body);
  };
  const cars = await request(
    "generate",
    generationInput(initial, { story: "She loves classic cars." }),
  );
  assert.match(cars.profile.biography, /classic cars/);
  // No approval here. A second story must build on the cars draft.
  const knitting = await request(
    "generate",
    generationInput(cars.state, { story: "She has started knitting." }),
  );
  assert.ok(knitting.profile.biography.startsWith(initial.profile.biography));
  assert.match(knitting.profile.biography, /classic cars/);
  assert.match(knitting.profile.biography, /knitting/);
  assert.match(knitting.notice, /earlier draft/);
  // Still nothing published until the family approves.
  assert.deepEqual((await request("state")).profile, initial.profile);
});
