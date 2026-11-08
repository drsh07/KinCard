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
    "story",
  ])
    assert.equal(hidden in care, false);
  // Neither an unchecked confirmation nor a forged checked flag may send
  // detectable raw identifiers to the provider or persist them.
  const unreviewed = {
    story: "We call her Jo. She enjoys garden photos.",
    relationship: "Grandchild",
    terms: false,
    revision: state.revision,
  };
  await request("interview", unreviewed, 400);
  await request("generate", unreviewed, 400);
  const secretPhone = "604-555-0199";
  const stillSensitive = {
    ...unreviewed,
    story: `We call her Jo. Her phone number is ${secretPhone}.`,
    privacyReviewed: true,
  };
  for (const endpoint of ["interview", "generate"]) {
    const blocked = await request(endpoint, stillSensitive, 400);
    assert.ok(
      !JSON.stringify(blocked).includes(secretPhone),
      "Privacy errors must not echo a detected identifier.",
    );
  }
  state = (
    await request("interview", {
      ...unreviewed,
      story: "We call her Jo. She enjoys garden photos. [removed].",
      privacyReviewed: true,
    })
  ).state;
  assert.equal(
    state.story,
    "We call her Jo. She enjoys garden photos. [removed].",
  );
  assert.equal(state.draft, null);
  assert.deepEqual(
    (await request(`care/${state.qrToken}`, undefined, 200, false)).profile,
    initial.profile,
  );

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
    privacyReviewed: true,
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
  // Translation may read approved text only and must never mutate the card.
  const approvedBeforeTranslation = await request(
    `care/${state.qrToken}`,
    undefined,
    200,
    false,
  );
  await request(
    `care/${state.qrToken}/translate`,
    { language: "not-a-language", revision: state.revision },
    400,
    false,
  );
  await request(
    `care/${state.qrToken}/translate`,
    { language: "es", revision: state.revision - 1 },
    409,
    false,
  );
  await request(
    "care/retired-fictional-token/translate",
    { language: "es", revision: state.revision },
    404,
    false,
  );
  await request(
    `care/${state.qrToken}/translate`,
    {
      language: "es",
      revision: state.revision,
      profile: { extra: "Do not accept caller-provided profile text." },
    },
    400,
    false,
  );
  const originalTranslation = await request(
    `care/${state.qrToken}/translate`,
    { language: "en", revision: state.revision },
    200,
    false,
  );
  assert.equal(originalTranslation.language, "en");
  assert.deepEqual(
    originalTranslation.profile,
    approvedBeforeTranslation.profile,
  );
  assert.ok(originalTranslation.labels.conversation);
  assert.ok(originalTranslation.copy.observationQuestion);
  const noKeyTranslation = await request(
    `care/${state.qrToken}/translate`,
    { language: "es", revision: state.revision },
    503,
    false,
  );
  assert.match(
    noKeyTranslation.error,
    /API key/,
    "Run this smoke test with Gemini unconfigured; it must not call a live provider.",
  );
  const unchangedAfterTranslation = await request(
    `care/${state.qrToken}`,
    undefined,
    200,
    false,
  );
  assert.deepEqual(unchangedAfterTranslation, approvedBeforeTranslation);

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
  const privateNote = await request(
    `care/${state.qrToken}/notes`,
    {
      author: "Alex alex@example.com",
      text: "Jo enjoyed garden photos today. Call 604-555-0199 for more details.",
    },
    201,
    false,
  );
  assert.ok(!JSON.stringify(privateNote).includes("604-555-0199"));
  assert.ok(!JSON.stringify(privateNote).includes("alex@example.com"));
  assert.match(privateNote.note.text, /\[removed\]/);
  state = await request("state");
  const savedPrivateNote = state.notes.find(
    (note) => note.id === privateNote.note.id,
  );
  assert.ok(
    savedPrivateNote &&
      !JSON.stringify(savedPrivateNote).includes("604-555-0199"),
  );
  if (privateNote.suggestion)
    state = (
      await request(`suggestions/${privateNote.suggestion.id}`, {
        decision: "rejected",
        revision: state.revision,
      })
    ).state;

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
    ...(initial.story === undefined
      ? { answers: initial.answers }
      : { story: initial.story }),
    privacyReviewed: true,
    relationship: initial.relationship,
    terms: initial.terms,
    revision: state.revision,
  });
}
await request("logout", {});
cookie = "";
await request("state", undefined, 401);
console.log(
  `Passed ${passed} local API checks: auth, draft isolation, validation, reviewed privacy boundaries, extraction fallback, note redaction, translation validation/no-key behaviour, visit review, QR rotation, and logout.`,
);
