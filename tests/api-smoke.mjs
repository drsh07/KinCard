import assert from "node:assert/strict";

// Run against a running LOCAL demo. It creates clearly fictional visit notes,
// rotates the demo QR, then restores the starting profile and interview answers.
const origin = process.argv[2] || "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname))
  throw Error("Run this mutation smoke test only against a local demo.");
let cookie = "";
let passed = 0;
async function request(
  path,
  payload,
  expected = 200,
  authenticated = true,
  raw = false,
) {
  const response = await fetch(`${origin}/api/${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      ...(authenticated && cookie ? { cookie } : {}),
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
    },
    body:
      payload === undefined
        ? undefined
        : raw
          ? payload
          : JSON.stringify(payload),
  });
  if (path === "login" && response.ok)
    cookie = response.headers.get("set-cookie").split(";")[0];
  const json = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(json)}`);
  passed++;
  return json;
}
await request("state", undefined, 401, false);
await request(
  "login",
  { username: "family", password: "incorrect" },
  401,
  false,
);
await request(
  "login",
  { username: "family", password: "KinCard2026!" },
  200,
  false,
);
const initial = await request("state");
let state = initial;
try {
  const care = await request(`care/${state.qrToken}`, undefined, 200, false);
  assert.deepEqual(care.profile, initial.profile);
  for (const hidden of [
    "answers",
    "draft",
    "notes",
    "suggestions",
    "relationship",
    "terms",
  ])
    assert.equal(hidden in care, false);
  const answers = {
    fullName: "Jordan Sample",
    preferredName: "Jo",
    biography: "Jo was a librarian.",
    conversation: "Jo enjoys talking about birds.",
    comfort: "Maybe quiet music helps.",
    avoid: "Loud television is upsetting.",
    routine: "Tea around three.",
    communication: "Please give Jo time to answer.",
    health: "Family reports hearing difficulty. Give aspirin daily.",
    extra: "Fictional API smoke-test profile.",
  };
  let result = await request("generate", {
    answers,
    relationship: "Grandchild",
    terms: false,
    revision: state.revision,
  });
  state = result.state;
  assert.equal(result.mode, "mock");
  assert.equal(state.draft.health, "");
  assert.ok(state.draft.uncertainties.length);
  const stillApproved = await request(
    `care/${state.qrToken}`,
    undefined,
    200,
    false,
  );
  assert.deepEqual(stillApproved.profile, initial.profile);
  assert.equal(stillApproved.updatedAt, care.updatedAt);
  await request(
    "approve-profile",
    { profile: state.draft, revision: initial.revision },
    409,
  );
  await request(
    "approve-profile",
    {
      profile: { ...state.draft, preferredName: "" },
      revision: state.revision,
    },
    400,
  );
  state = (
    await request("approve-profile", {
      profile: state.draft,
      revision: state.revision,
    })
  ).state;
  assert.equal(
    (await request(`care/${state.qrToken}`, undefined, 200, false)).profile
      .preferredName,
    "Jo",
  );
  const first = await request(
    `care/${state.qrToken}/notes`,
    {
      author: "Alex (fictional demo visitor)",
      text: "Jo enjoyed talking about birds during this fictional test visit.",
    },
    201,
    false,
  );
  assert.equal(first.suggestion.status, "pending");
  const before = (await request(`care/${state.qrToken}`, undefined, 200, false))
    .profile;
  assert.deepEqual(before, state.profile);
  state = await request("state");
  state = (
    await request(`suggestions/${first.suggestion.id}`, {
      decision: "rejected",
      revision: state.revision,
    })
  ).state;
  assert.deepEqual(state.profile, before);
  const second = await request(
    `care/${state.qrToken}/notes`,
    {
      author: "Alex (fictional demo visitor)",
      text: "Jo seemed calmer with quiet instrumental music during this fictional test visit.",
    },
    201,
    false,
  );
  state = await request("state");
  state = (
    await request(`suggestions/${second.suggestion.id}`, {
      decision: "approved",
      revision: state.revision,
    })
  ).state;
  assert.match(state.profile.comfort, /Visitor observation:/);
  await request(
    `suggestions/${second.suggestion.id}`,
    { decision: "approved", revision: state.revision },
    409,
  );
  const unsafe = await request(
    `care/${state.qrToken}/notes`,
    {
      author: "Alex (fictional demo visitor)",
      text: "Give aspirin daily. Fictional test of withholding treatment directions.",
    },
    201,
    false,
  );
  assert.equal(unsafe.suggestion, null);
  state = await request("state");
  const oldToken = state.qrToken;
  state = (await request("qr", { revision: state.revision })).state;
  await request(`care/${oldToken}`, undefined, 404, false);
  await request(`care/${state.qrToken}`, undefined, 200, false);
  await request("interview", "{invalid", 400, true, true);
  await request(
    "interview",
    {
      answers: { unsupported: "bad" },
      relationship: "Friend",
      terms: false,
      revision: state.revision,
    },
    400,
  );
} finally {
  state = await request("state");
  if (initial.profile)
    state = (
      await request("approve-profile", {
        profile: initial.profile,
        revision: state.revision,
      })
    ).state;
  await request("interview", {
    answers: initial.answers,
    relationship: initial.relationship,
    terms: initial.terms,
    revision: state.revision,
  });
}
await request("logout", {});
cookie = "";
await request("state", undefined, 401);
console.log(
  `Passed ${passed} local API checks: auth, draft isolation, validation, extraction fallback, visit review, QR rotation, and logout.`,
);
