import test from "node:test";
import assert from "node:assert/strict";
import { emptyAnswers } from "../lib/domain.ts";
import {
  requirePrivacyReviewed,
  screenAnswers,
  screenProfile,
  screenText,
} from "../lib/privacy.ts";
import { generateNarrative } from "../lib/narrative.ts";
import { InputError } from "../lib/validation.ts";

const sensitiveCases = [
  ["PHN is 9876543210", "9876543210", "healthId"],
  ["Patient ID: ABC123456", "ABC123456", "healthId"],
  ["123456789", "123456789", "governmentId"],
  ["passport number AB1234567", "AB1234567", "governmentId"],
  ["SIN is 123-456-789", "123-456-789", "governmentId"],
  ["Phone number is 604-555-0199", "604-555-0199", "phone"],
  ["Call 555-0199", "555-0199", "phone"],
  ["Call +44 2079460958", "+44 2079460958", "phone"],
  ["Call 6045550199", "6045550199", "phone"],
  [
    "my phone is six zero four five five five zero one nine nine",
    "six zero four",
    "phone",
  ],
  [
    "PHN is nine eight seven six five four three two one zero",
    "nine eight seven",
    "healthId",
  ],
  ["Email sarah@example.com", "sarah@example.com", "email"],
  [
    "email sarah dot morgan at gmail dot com",
    "sarah dot morgan at gmail dot com",
    "email",
  ],
  [
    "Address is one two three Main Street",
    "one two three Main Street",
    "address",
  ],
  ["Address is 123 Main Street", "123 Main Street", "address"],
  ["V6B 1A1", "V6B 1A1", "postal"],
  ["DOB: 1940-05-06", "1940-05-06", "birthDate"],
  ["Her date of birth is May 6, 1940", "May 6, 1940", "birthDate"],
  [
    "born on July four nineteen thirty eight",
    "July four nineteen thirty eight",
    "birthDate",
  ],
  ["credit card 4111 1111 1111 1111", "4111 1111 1111 1111", "financial"],
  ["account number 12345678", "12345678", "financial"],
  ["PIN is one two three four", "one two three four", "credential"],
  ["password is VerySecret123!", "VerySecret123", "credential"],
  ["API key: abcdef0123456789", "abcdef0123456789", "credential"],
] as const;

test("deterministic privacy screen removes direct and spoken identifiers", () => {
  for (const [input, secret, category] of sensitiveCases) {
    const result = screenText(`${input}. Maggie loves her garden.`);
    assert.equal(result.changed, true, input);
    assert.ok(
      !result.text.includes(secret),
      input + " remains in screened text",
    );
    assert.ok(
      !JSON.stringify(result.findings).includes(secret),
      input + " leaks into metadata",
    );
    assert.ok(
      result.findings.some(
        (finding) =>
          finding.category === category && finding.action === "removed",
      ),
      `${input}: expected ${category}`,
    );
    assert.match(result.text, /Maggie loves her garden/);
    assert.equal(
      screenText(result.text).changed,
      false,
      "Screened output must be stable: " + input,
    );
  }
});

test("routine times, ages, care preferences and patient health needs remain available for review", () => {
  const input =
    "Maggie is 82. Tea at 3 pm helps her feel at home. Give her one question at a time. Family reports hearing difficulty and diabetes.";
  const result = screenText(input);
  assert.equal(result.text, input);
  assert.equal(result.changed, false);
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.category === "healthContext" && finding.action === "review",
    ),
  );
});

test("sensitive third-party allegations and facts removed while neutral family visits remain reviewable", () => {
  const result = screenText(
    "Her neighbour Jane Smith has HIV. Nurse John Doe stole money. Maggie enjoys gardening. Her daughter Sarah visits often.",
  );
  assert.ok(
    !result.text.includes("HIV") && !result.text.includes("stole money"),
  );
  assert.ok(
    !result.text.includes("Jane Smith") && !result.text.includes("John Doe"),
  );
  assert.match(result.text, /Maggie enjoys gardening/);
  assert.match(result.text, /daughter Sarah visits/);
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.category === "thirdPartyContext" && finding.action === "review",
    ),
  );
});

test("server boundary requires review and rejects identifiers reintroduced after review", () => {
  assert.throws(
    () => requirePrivacyReviewed("Maggie loves gardens.", false),
    /privacy-screened text/,
  );
  assert.throws(
    () => requirePrivacyReviewed("Phone 604-555-0199.", true),
    /privacy review again/,
  );
  assert.equal(requirePrivacyReviewed("", false), "");
  const safe = screenText("Maggie loves gardens. Phone 604-555-0199.").text;
  assert.equal(requirePrivacyReviewed(safe, true), safe);
});

test("all profile fields and uncertainty text are independently screened before saving", () => {
  const original = {
    ...emptyAnswers(),
    preferredName: "Maggie",
    biography: "Phone 604-555-0199",
    health: "PHN is 9876543210",
    uncertainties: ["Ask sarah@example.com"],
  };
  const result = screenProfile(original);
  assert.equal(result.preferredName, "Maggie");
  assert.ok(!JSON.stringify(result).includes("604-555-0199"));
  assert.ok(!JSON.stringify(result).includes("9876543210"));
  assert.ok(!JSON.stringify(result).includes("sarah@example.com"));
  assert.ok(
    result.uncertainties.some((value) => value.includes("privacy screen")),
  );
  assert.equal(
    screenAnswers({ ...emptyAnswers(), extra: "SIN is 123-456-789" }).extra,
    "[removed]",
  );
});

test("only reviewed screened story reaches a Gemini request", async () => {
  const raw =
    "Please call her Maggie. Contact sarah@example.com. She enjoys her garden.";
  const screened = requirePrivacyReviewed(screenText(raw).text, true);
  let called = false;
  await assert.rejects(
    () =>
      generateNarrative(screened, {
        key: "fake-test-key",
        fetcher: (async (_url, init) => {
          called = true;
          assert.ok(!String(init?.body).includes("sarah@example.com"));
          assert.ok(String(init?.body).includes("[removed]"));
          return new Response("unavailable", { status: 503 });
        }) as typeof fetch,
      }),
    InputError,
  );
  assert.equal(called, true);
});
