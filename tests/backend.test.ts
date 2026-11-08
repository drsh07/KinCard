import test from "node:test";
import assert from "node:assert/strict";
import { PROFILE_FIELDS, emptyAnswers, seedState } from "../lib/domain.ts";
import {
  generateProfile,
  generateSuggestion,
  groundProfile,
  mockProfile,
} from "../lib/ai.ts";
import { approveProfile, decideSuggestion } from "../lib/transitions.ts";
import {
  hasTreatmentDirection,
  parseAnswers,
  parseProfile,
  requireRevision,
  safeSentences,
} from "../lib/validation.ts";

test("mock preserves supplied facts and leaves missing answers blank", () => {
  const answers = {
    ...emptyAnswers(),
    preferredName: "Jo",
    conversation: "I love gardens.",
  };
  const profile = mockProfile(answers);
  assert.equal(profile.preferredName, "Jo");
  assert.equal(profile.conversation, "I love gardens.");
  assert.equal(profile.routine, "");
  assert.equal(profile.health, "");
});
test("uncertain family language is preserved and flagged", () => {
  const profile = mockProfile({
    ...emptyAnswers(),
    comfort: "Maybe jazz helps sometimes.",
  });
  assert.equal(profile.comfort, "Maybe jazz helps sometimes.");
  assert.ok(profile.uncertainties.some((value) => value.includes("comfort")));
});
test("treatment directions withheld across every field, including split lines", () => {
  for (const instruction of [
    "Give 10 mg aspirin daily.",
    "Take donepezil every morning",
    "Give levodopa at 8 am",
    "She needs donepezil nightly",
    "Give\naspirin",
    "Apply the cream after lunch",
    "Double the medication",
    "Stop warfarin",
    "Monitor blood glucose every two hours",
    "Use diazepam to calm her",
  ]) {
    assert.equal(hasTreatmentDirection(instruction), true, instruction);
    assert.equal(safeSentences(instruction).value, "", instruction);
    for (const field of PROFILE_FIELDS)
      assert.equal(
        mockProfile({ ...emptyAnswers(), [field]: instruction })[field],
        "",
        `${field}: ${instruction}`,
      );
  }
  assert.equal(hasTreatmentDirection("I take a walk every morning."), false);
  assert.equal(
    hasTreatmentDirection("Family reports hearing difficulty."),
    false,
  );
});
test("AI output must be grounded verbatim and not invent comforting effects", () => {
  const answers = {
    ...emptyAnswers(),
    preferredName: "Jo",
    conversation: "Jo enjoys music.",
  };
  const generated = {
    ...emptyAnswers(),
    preferredName: "Jo",
    comfort: "Music calms Jo.",
    uncertainFields: [],
  };
  const profile = groundProfile(generated, answers);
  assert.equal(profile.preferredName, "Jo");
  assert.equal(profile.comfort, "");
  assert.equal(profile.routine, "");
  assert.ok(
    profile.uncertainties.some((value) => value.includes("unsupported")),
  );
});
test("grounding cannot strip negation or uncertainty by selecting a substring", () => {
  for (const [field, source, shortened] of [
    ["comfort", "Music does not calm her.", "calm her"],
    ["health", "She does not have diabetes.", "diabetes"],
    ["conversation", "She does not enjoy jazz.", "enjoy jazz"],
    ["comfort", "Maybe jazz helps, but only when quiet.", "jazz helps"],
  ] as const) {
    const answers = { ...emptyAnswers(), [field]: source };
    const output = {
      ...emptyAnswers(),
      [field]: shortened,
      uncertainFields: [],
    };
    assert.equal(groundProfile(output, answers)[field], "", source);
    assert.equal(
      groundProfile({ ...output, [field]: source }, answers)[field],
      source,
    );
  }
});
test("absent API key makes no network call and explicitly selects mock mode", async () => {
  const result = await generateProfile(emptyAnswers(), {
    fetcher: (() => {
      throw Error("must not call");
    }) as typeof fetch,
  });
  assert.equal(result.mode, "mock");
  assert.match(result.notice, /No Gemini request/);
});
test("Gemini failure or malformed schema falls back to original answers", async () => {
  const answers = { ...emptyAnswers(), preferredName: "Jo" };
  for (const fetcher of [
    async () => new Response("denied", { status: 401 }),
    async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: "not JSON" }] } }],
      }),
  ]) {
    const result = await generateProfile(answers, {
      key: "fictional-test-key",
      fetcher: fetcher as typeof fetch,
    });
    assert.equal(result.mode, "mock");
    assert.equal(result.profile.preferredName, "Jo");
    assert.match(result.notice, /fallback/);
  }
});
test("valid Gemini extraction is used; key appears only in request header", async () => {
  const answers = {
    ...emptyAnswers(),
    preferredName: "Jo",
    biography: "Jo was a teacher.",
  };
  const output = { ...answers, uncertainFields: [] };
  const result = await generateProfile(answers, {
    key: "fictional-test-key",
    fetcher: (async (url, init) => {
      assert.ok(!String(url).includes("fictional-test-key"));
      assert.equal(
        (init?.headers as Record<string, string>)["x-goog-api-key"],
        "fictional-test-key",
      );
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(output) }] },
          },
        ],
      });
    }) as typeof fetch,
  });
  assert.equal(result.mode, "gemini");
  assert.equal(result.profile.biography, answers.biography);
});
test("notes produce grounded suggestions and withhold unsafe notes", async () => {
  const result = await generateSuggestion(
    "Maggie seemed calmer with a quiet song.",
    {},
  );
  assert.equal(result.value, "Maggie seemed calmer with a quiet song.");
  assert.equal(result.field, "comfort");
  const unsafe = await generateSuggestion("Give aspirin every morning.", {});
  assert.equal(unsafe.value, "");
});
test("shortened Gemini visit notes fall back to full contextual observation", async () => {
  const note =
    "Music did not calm Jo today. Maybe a quiet room helped instead.";
  const result = await generateSuggestion(note, {
    key: "fictional-test-key",
    fetcher: (async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({ field: "comfort", value: "calm Jo" }),
                },
              ],
            },
          },
        ],
      })) as typeof fetch,
  });
  assert.equal(result.mode, "mock");
  assert.equal(result.value, note);
});
test("reject does not change approved card; approve appends once only", () => {
  const state = seedState();
  state.suggestions = [
    {
      id: "s1",
      noteId: "n1",
      field: "comfort",
      value: "A quiet song seemed helpful.",
      reason: "Observation",
      uncertain: true,
      status: "pending",
      createdAt: new Date().toISOString(),
      baseValue: state.profile!.comfort,
    },
  ];
  const rejected = decideSuggestion(state, "s1", "rejected");
  assert.deepEqual(rejected.profile, state.profile);
  assert.equal(rejected.suggestions[0].status, "rejected");
  const approved = decideSuggestion(state, "s1", "approved");
  assert.match(approved.profile!.comfort, /Visitor observation:/);
  assert.throws(() => decideSuggestion(approved, "s1", "approved"), /already/);
});
test("stale revisions and changed fields cannot overwrite family edits", () => {
  assert.throws(() => requireRevision({ revision: 1 }, 2), /another tab/);
  assert.throws(() => requireRevision({}, 2), /revision/);
  const state = seedState();
  state.suggestions = [
    {
      id: "s1",
      noteId: "n1",
      field: "comfort",
      value: "Quiet music",
      reason: "Observation",
      uncertain: true,
      status: "pending",
      createdAt: "now",
      baseValue: "Old text",
    },
  ];
  assert.throws(
    () => decideSuggestion(state, "s1", "approved"),
    /section changed/,
  );
});
test("validation bounds fields, disallows unknown fields, requires reviewed name", () => {
  assert.throws(() => parseAnswers({ fake: "x" }), /Unknown/);
  assert.throws(
    () => parseAnswers({ ...emptyAnswers(), biography: "x".repeat(4001) }),
    /too long/,
  );
  assert.throws(
    () => parseProfile({ ...emptyAnswers(), uncertainties: [] }),
    /preferred name/,
  );
  const state = seedState();
  assert.throws(
    () =>
      approveProfile(state, {
        ...state.profile!,
        preferredName: "Give aspirin",
      }),
    /preferred name/,
  );
});
