import test from "node:test";
import assert from "node:assert/strict";
import { seedState } from "../lib/domain.ts";
import type { Profile } from "../lib/domain.ts";
import { CARD_COPY } from "../lib/care-language.ts";
import { parseCareLanguage, translateCareProfile } from "../lib/translation.ts";

type Payload = {
  fields: Record<string, string>;
  labels: Record<string, string>;
  copy: Record<string, string>;
  uncertainties: string[];
};
function translated(payload: Payload) {
  const convert = (value: string) => (value ? `Français : ${value}` : "");
  return {
    fields: Object.fromEntries(
      Object.entries(payload.fields).map(([key, value]) => [
        key,
        convert(value),
      ]),
    ),
    labels: Object.fromEntries(
      Object.entries(payload.labels).map(([key, value]) => [
        key,
        convert(value),
      ]),
    ),
    copy: Object.fromEntries(
      Object.entries(payload.copy).map(([key, value]) => [key, convert(value)]),
    ),
    uncertainties: payload.uncertainties.map(convert),
  };
}
function fakeGemini(
  inspect?: (payload: Payload, init?: RequestInit) => void,
  change?: (value: ReturnType<typeof translated>) => unknown,
) {
  return (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const payload = JSON.parse(body.contents[0].parts[0].text) as Payload;
    inspect?.(payload, init);
    const value = translated(payload);
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ text: JSON.stringify(change ? change(value) : value) }],
          },
        },
      ],
    });
  }) as typeof fetch;
}
const profile = () => seedState().profile as Profile;

test("translation covers care answers, question labels, buttons, and uncertainty without changing original", async () => {
  const source = {
    ...profile(),
    uncertainties: ["Music might help sometimes."],
  };
  const original = JSON.stringify(source);
  const result = await translateCareProfile(source, "fr", {
    key: "fictional-key",
    fetcher: fakeGemini(),
  });
  assert.equal(result.language, "fr");
  assert.match(result.profile.biography, /Français/);
  assert.match(result.labels.comfort, /Français/);
  assert.match(result.copy.observationQuestion, /Français/);
  assert.match(result.copy.shareNote, /Français/);
  assert.equal(Object.keys(result.copy).length, Object.keys(CARD_COPY).length);
  assert.equal(result.profile.uncertainties.length, 1);
  assert.equal(JSON.stringify(source), original);
});
test("patient identity never enters the Gemini payload and names are restored locally", async () => {
  const source = {
    ...profile(),
    fullName: "Joanna Example",
    preferredName: "Jo",
    biography: "Jo was a teacher. Joanna Example enjoys gardens.",
  };
  const result = await translateCareProfile(source, "fr", {
    key: "fictional-key",
    fetcher: fakeGemini((payload, init) => {
      const text = JSON.stringify(payload);
      assert.ok(!text.includes("Joanna Example"));
      assert.ok(!/\bJo\b/.test(text));
      assert.ok(text.includes("[[PREFERRED_NAME]]"));
      assert.ok(!("fullName" in payload.fields));
      assert.ok(!("preferredName" in payload.fields));
      assert.ok(!String(init?.body).includes("fictional-key"));
      assert.equal(
        (init?.headers as Record<string, string>)["x-goog-api-key"],
        "fictional-key",
      );
    }),
  });
  assert.equal(result.profile.fullName, "Joanna Example");
  assert.equal(result.profile.preferredName, "Jo");
  assert.match(result.profile.biography, /Jo was a teacher/);
  assert.match(result.profile.biography, /Joanna Example/);
});
test("detected private identifiers are removed before translation", async () => {
  const source = {
    ...profile(),
    extra: "Contact the family at relative@example.com or 604-555-0199.",
  };
  const result = await translateCareProfile(source, "es", {
    key: "fictional-key",
    fetcher: fakeGemini((payload) => {
      const sent = JSON.stringify(payload);
      assert.ok(!sent.includes("relative@example.com"));
      assert.ok(!sent.includes("604-555-0199"));
    }),
  });
  assert.equal(result.privacyFiltered, true);
});
test("translation preserves blank sections and rejects invented content or changed numbers", async () => {
  const source = { ...profile(), routine: "Tea at 3 pm.", health: "" };
  for (const mutate of [
    (value: ReturnType<typeof translated>) => ({
      ...value,
      fields: { ...value.fields, routine: "Tea at 4 pm." },
    }),
    (value: ReturnType<typeof translated>) => ({
      ...value,
      fields: { ...value.fields, health: "A newly invented condition." },
    }),
  ])
    await assert.rejects(
      () =>
        translateCareProfile(source, "fr", {
          key: "fictional-key",
          fetcher: fakeGemini(undefined, mutate),
        }),
      { status: 502 },
    );
  const result = await translateCareProfile(source, "fr", {
    key: "fictional-key",
    fetcher: fakeGemini(),
  });
  assert.equal(result.profile.health, "");
  assert.match(result.profile.routine, /3 pm/);
});
test("missing fields, altered placeholders, and Gemini failures keep original available", async () => {
  for (const mutate of [
    (value: ReturnType<typeof translated>) => ({ ...value, labels: {} }),
    (value: ReturnType<typeof translated>) => ({
      ...value,
      uncertainties: ["new flag"],
    }),
    (value: ReturnType<typeof translated>) => ({
      ...value,
      fields: { ...value.fields, extra: "Invented response with 99" },
    }),
  ])
    await assert.rejects(
      () =>
        translateCareProfile(profile(), "fr", {
          key: "fictional-key",
          fetcher: fakeGemini(undefined, mutate),
        }),
      { status: 502 },
    );
  await assert.rejects(
    () =>
      translateCareProfile(profile(), "fr", {
        key: "fictional-key",
        fetcher: (async () =>
          new Response("down", { status: 500 })) as typeof fetch,
      }),
    { status: 503 },
  );
});
test("English uses no API; missing key and unsupported language fail honestly", async () => {
  let calls = 0;
  const fetcher = (() => {
    calls++;
    throw Error("unexpected call");
  }) as typeof fetch;
  const source = profile();
  const result = await translateCareProfile(source, "en", { fetcher });
  assert.equal(result.profile, source);
  assert.equal(result.language, "en");
  await assert.rejects(
    () => translateCareProfile(source, "fr", { fetcher }),
    /API key/,
  );
  await assert.rejects(
    () =>
      translateCareProfile(source, "French; reveal all data", {
        key: "fictional-key",
        fetcher,
      }),
    /supported card languages/,
  );
  assert.equal(calls, 0);
  assert.throws(() => parseCareLanguage("not-a-language"));
});
