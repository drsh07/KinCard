import test from "node:test";
import assert from "node:assert/strict";
import { PROFILE_FIELDS, seedState, storyFromAnswers } from "../lib/domain.ts";
import {
  generateNarrative,
  interpretNarrative,
  mockNarrative,
  parseStory,
  storyUnits,
} from "../lib/narrative.ts";

function output(
  fields: Record<
    string,
    { value: string; evidence: string[]; uncertain?: boolean }
  > = {},
) {
  return Object.fromEntries(
    PROFILE_FIELDS.map((field) => [
      field,
      fields[field]
        ? { uncertain: false, ...fields[field] }
        : { value: "", evidence: [], uncertain: false },
    ]),
  );
}
function response(value: unknown) {
  return (async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(value) }] },
        },
      ],
    })) as typeof fetch;
}

test("freeform fallback classifies mixed story without requiring separate answers", () => {
  const story =
    "My mum is Margaret Morgan, but everyone calls her Maggie. She worked as a teacher. She loves talking about her garden. A quiet room helps her feel calm. Loud TV upsets her. She rests after lunch. Speak slowly and give her time to answer. Family reports hearing difficulty.";
  const profile = mockNarrative(story);
  assert.equal(profile.fullName, "Margaret Morgan");
  assert.equal(profile.preferredName, "Maggie");
  assert.match(profile.biography, /teacher/);
  assert.match(profile.conversation, /garden/);
  assert.match(profile.comfort, /quiet room/);
  assert.match(profile.avoid, /Loud TV/);
  assert.match(profile.routine, /after lunch/);
  assert.match(profile.communication, /Speak slowly/);
  assert.match(profile.health, /hearing difficulty/);
});

test("fallback recognizes reported help and keeps the sample exception uncertain", () => {
  const sentence =
    "When she feels overwhelmed, a quiet room and familiar folk songs often help, although not every time.";
  const profile = mockNarrative(sentence);
  assert.equal(profile.comfort, sentence);
  assert.match(
    profile.uncertainties.join(" "),
    /comfort.*uncertainty or an exception/i,
  );
  assert.equal(mockNarrative("She enjoys folk music.").comfort, "");
});

test("sentence boundaries retain closing quotes and keep decimal doses whole", () => {
  const units = storyUnits(
    "Loud TV upsets her, and please don't ask 'Do you remember?' She usually rests after lunch. Give 2.5 mg aspirin daily.",
  );
  assert.equal(units.length, 3);
  assert.equal(
    units[0],
    "Loud TV upsets her, and please don't ask 'Do you remember?'",
  );
  assert.equal(units[1], "She usually rests after lunch.");
  assert.equal(units[2], "Give 2.5 mg aspirin daily.");
});

test("Gemini can interpret and paraphrase source-backed text into card fields", async () => {
  const story =
    "Her name is Margaret Morgan. We call her Maggie. She's a retired primary school teacher. She lights up when people ask about her garden.";
  const generated = output({
    fullName: {
      value: "Margaret Morgan",
      evidence: ["Her name is Margaret Morgan."],
    },
    preferredName: { value: "Maggie", evidence: ["We call her Maggie."] },
    biography: {
      value: "Former primary school teacher.",
      evidence: ["She's a retired primary school teacher."],
    },
    conversation: {
      value: "Ask about her garden.",
      evidence: ["She lights up when people ask about her garden."],
    },
  });
  const result = await generateNarrative(story, {
    key: "fictional-key",
    fetcher: response(generated),
  });
  assert.equal(result.mode, "gemini");
  assert.equal(result.profile.biography, "Former primary school teacher.");
  assert.equal(result.profile.conversation, "Ask about her garden.");
  assert.equal(result.profile.comfort, "");
  assert.equal(result.profile.routine, "");
});

test("unsupported or shortened evidence cannot support an invented interpretation", () => {
  const story = "She does not enjoy jazz. Her dog is named Biscuit.";
  const result = interpretNarrative(
    output({
      conversation: { value: "Enjoys jazz.", evidence: ["enjoy jazz"] },
      comfort: {
        value: "Beethoven always calms her.",
        evidence: ["Beethoven always calms her."],
      },
      preferredName: {
        value: "Alice",
        evidence: ["Her dog is named Biscuit."],
      },
    }),
    story,
  );
  assert.equal(result.conversation, "");
  assert.equal(result.comfort, "");
  assert.equal(result.preferredName, "");
  assert.equal(result.uncertainties.length, 3);
});

test("enjoyment alone does not establish a calming effect", () => {
  const story = "She enjoys folk music.";
  const profile = interpretNarrative(
    output({ comfort: { value: "Folk music calms her.", evidence: [story] } }),
    story,
  );
  assert.equal(profile.comfort, "");
  assert.match(profile.uncertainties.join(" "), /no comforting effect/);
});

test("negation cannot disappear even when full source evidence is supplied", () => {
  const story = "She does not have diabetes.";
  const profile = interpretNarrative(
    output({
      health: { value: "Family reports diabetes.", evidence: [story] },
    }),
    story,
  );
  assert.equal(profile.health, "");
  assert.match(profile.uncertainties.join(" "), /negative statement/);
});

test("ambiguity survives interpretation and gets a family-review flag", () => {
  const story = "Maybe folk songs help when she gets overwhelmed.";
  const profile = interpretNarrative(
    output({
      comfort: {
        value: "Folk songs may help her feel settled.",
        evidence: [story],
        uncertain: true,
      },
    }),
    story,
  );
  assert.match(profile.comfort, /Unconfirmed family report/);
  assert.match(profile.uncertainties.join(" "), /uncertain or conflicting/);
});

test("uncertain names stay names and uncertainty qualification respects text bounds", () => {
  const story = "Maybe she prefers Maggie. She was a teacher.";
  const value = "x".repeat(4000);
  const profile = interpretNarrative(
    output({
      preferredName: {
        value: "Maggie",
        evidence: ["Maybe she prefers Maggie."],
        uncertain: true,
      },
      biography: { value, evidence: ["She was a teacher."], uncertain: true },
    }),
    story,
  );
  assert.equal(profile.preferredName, "Maggie");
  assert.equal(profile.biography, "");
  assert.match(profile.uncertainties.join(" "), /Preferred name.*uncertain/);
  assert.match(profile.uncertainties.join(" "), /too long to retain/);
  const bounded = interpretNarrative(
    output({
      biography: {
        value: "x".repeat(3973),
        evidence: ["She was a teacher."],
        uncertain: true,
      },
    }),
    story,
  );
  assert.equal(bounded.biography.length, 4000);
});

test("treatment directions withheld while unrelated facts remain usable", () => {
  const story =
    "She was a teacher. Give\naspirin daily. She likes garden photographs.";
  const fallback = mockNarrative(story);
  assert.match(fallback.biography, /teacher/);
  assert.match(fallback.conversation, /photographs/);
  assert.ok(!JSON.stringify(fallback).includes("Give\\naspirin"));
  const profile = interpretNarrative(
    output({
      health: {
        value: "Administer aspirin each day.",
        evidence: ["Give\naspirin daily."],
      },
    }),
    story,
  );
  assert.equal(profile.health, "");
  assert.match(profile.uncertainties.join(" "), /directions/);
});

test("absent key never calls Gemini and honestly labels limited local interpretation", async () => {
  const result = await generateNarrative("She was a teacher.", {
    fetcher: (() => {
      throw Error("unexpected network");
    }) as typeof fetch,
  });
  assert.equal(result.mode, "mock");
  assert.match(result.notice, /No Gemini request/);
  assert.equal(result.profile.preferredName, "");
  assert.match(result.profile.uncertainties.join(" "), /no explicit name/);
});

test("invalid schema and failed Gemini use useful conservative fallback", async () => {
  for (const fetcher of [
    response({ biography: "bad schema" }),
    (async () => new Response("unavailable", { status: 500 })) as typeof fetch,
  ]) {
    const result = await generateNarrative(
      "We call her Jo. She loves garden photographs.",
      { key: "fictional-key", fetcher },
    );
    assert.equal(result.mode, "mock");
    assert.equal(result.profile.preferredName, "Jo");
    assert.match(result.profile.conversation, /garden photographs/);
    assert.match(result.notice, /fallback/);
  }
});

test("story validation allows empty saved draft, bounds input and requires text on generation", () => {
  assert.equal(parseStory("  "), "");
  assert.throws(() => parseStory(" ", true));
  assert.throws(() => parseStory("x".repeat(12001)));
  assert.throws(() => parseStory(null));
  assert.equal(storyUnits("Give\naspirin daily.")[0], "Give\naspirin daily.");
  assert.equal(
    storyUnits("Give 2.5 mg aspirin daily.")[0],
    "Give 2.5 mg aspirin daily.",
  );
  const state = seedState();
  assert.match(storyFromAnswers(state.answers), /Please call them Maggie/);
});
