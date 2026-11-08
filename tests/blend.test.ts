import test from "node:test";
import assert from "node:assert/strict";
import { emptyAnswers } from "../lib/domain.ts";
import type { Profile } from "../lib/domain.ts";
import { blendSections, keepsEverything } from "../lib/blend.ts";
import { mergeProfile } from "../lib/memory.ts";

const card = (fields: Partial<Profile>): Profile => ({
  ...emptyAnswers(),
  uncertainties: [],
  ...fields,
});
const envelope = (value: unknown) =>
  Response.json({
    candidates: [
      { finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } },
    ],
  });
const gemini = (reply: unknown) => ({
  key: "fictional-blend-test-key",
  model: "gemini-3.8-flash",
  fetcher: (async () => envelope(reply)) as typeof fetch,
});

test("smooth blend that keeps every detail passes", () => {
  assert.ok(
    keepsEverything("She likes her garden.", "She likes cars.", "She likes her garden and cars."),
  );
  assert.ok(
    keepsEverything(
      "Loud television can feel overwhelming.",
      "Visitor observation: Busy rooms upset her.",
      "Loud television and busy rooms can feel overwhelming; a visitor observation noted busy rooms upset her.",
    ),
  );
});

test("a blend that drops, flips or invents details is rejected", () => {
  // dropped "garden"
  assert.ok(!keepsEverything("She likes her garden.", "She likes cars.", "She likes cars."));
  // lost a negation
  assert.ok(
    !keepsEverything("She does not like loud TV.", "She likes jazz.", "She likes loud TV and jazz."),
  );
  // lost uncertainty
  assert.ok(
    !keepsEverything("She might enjoy tea.", "She likes cars.", "She enjoys tea and cars."),
  );
  // invented a name and a number
  assert.ok(
    !keepsEverything("She likes cars.", "She likes tea.", "She likes cars, especially her Ford, and tea."),
  );
  assert.ok(
    !keepsEverything("She has tea in the afternoon.", "She likes cars.", "She has tea at 3 in the afternoon and likes cars."),
  );
});

test("garden then cars: Gemini blends it into one natural sentence", async () => {
  const existing = card({ preferredName: "Maggie", conversation: "She likes her garden." });
  const merge = mergeProfile(existing, card({ conversation: "She likes cars." }));
  const blend = await blendSections(
    existing,
    merge.profile,
    merge.additions,
    gemini({ conversation: "She likes her garden and cars." }),
  );
  assert.equal(blend.profile.conversation, "She likes her garden and cars.");
  assert.deepEqual(blend.blended, ["conversation"]);
});

test("if Gemini's blend loses a detail, the plain added line is kept", async () => {
  const existing = card({ preferredName: "Maggie", conversation: "She likes her garden." });
  const merge = mergeProfile(existing, card({ conversation: "She likes cars." }));
  const blend = await blendSections(
    existing,
    merge.profile,
    merge.additions,
    gemini({ conversation: "She likes cars." }),
  );
  assert.equal(blend.profile.conversation, "She likes her garden.\n\nShe likes cars.");
  assert.deepEqual(blend.kept, ["conversation"]);
});

test("without Gemini, or if Gemini fails, updates stay plain and nothing is lost", async () => {
  const existing = card({ preferredName: "Maggie", conversation: "She likes her garden." });
  const merge = mergeProfile(existing, card({ conversation: "She likes cars." }));
  const offline = await blendSections(existing, merge.profile, merge.additions, {});
  assert.equal(offline.profile.conversation, "She likes her garden.\n\nShe likes cars.");
  const failing = await blendSections(existing, merge.profile, merge.additions, {
    key: "fictional-blend-test-key",
    fetcher: (async () => new Response("{}", { status: 503 })) as typeof fetch,
  });
  assert.equal(failing.profile.conversation, "She likes her garden.\n\nShe likes cars.");
});

test("first-person card + third-person story blends naturally", () => {
  assert.ok(
    keepsEverything(
      "Ask me about my garden or Biscuit.",
      "She loves talking about her old blue Mustang.",
      "Ask me about my garden, Biscuit, or my old blue Mustang, which I love.",
    ),
  );
});

test("softening a feeling word is rejected (loves is not 'has an interest in')", () => {
  assert.ok(
    !keepsEverything(
      "Worked as a primary school teacher for 30 years.",
      "She also loves classic cars.",
      "Worked as a primary school teacher for 30 years and, in addition to her background as a teacher, she has an interest in classic cars.",
    ),
  );
  assert.ok(
    keepsEverything(
      "Worked as a primary school teacher for 30 years.",
      "She also loves classic cars.",
      "Worked as a primary school teacher for 30 years and loves classic cars.",
    ),
  );
});

test("word forms match: love / loves / loved, box / boxes, story / stories", async () => {
  const { stem } = await import("../lib/blend.ts");
  assert.equal(stem("loves"), stem("love"));
  assert.equal(stem("loved"), stem("love"));
  assert.equal(stem("boxes"), stem("box"));
  assert.equal(stem("stories"), stem("story"));
  assert.equal(stem("gardens"), stem("garden"));
});
