import test from "node:test";
import assert from "node:assert/strict";
import {
  checkGeminiConnection,
  getAiStatus,
  hasConfiguredGemini,
  requestJson,
} from "../lib/gemini.ts";
import { InputError } from "../lib/validation.ts";

const key = "fictional-transport-test-key";
const schema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
};
const envelope = (value: unknown) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(value) }] },
      },
    ],
  });

test("Gemini configuration normalizes local settings without exposing or falsely verifying a key", () => {
  assert.equal(getAiStatus({ key: "   " }).configured, false);
  const status = getAiStatus({
    key: ` ${key} `,
    model: " models/gemini-3.8-flash ",
  });
  assert.deepEqual(status, {
    configured: true,
    model: "gemini-3.8-flash",
    mode: "gemini",
  });
  assert.ok(!JSON.stringify(status).includes(key));
  for (const config of [
    { key: "your_key_here" },
    { key, model: "invalid / model" },
    { key: "key with spaces" },
  ]) {
    assert.ok(getAiStatus(config).issue);
    assert.throws(() => hasConfiguredGemini(config), InputError);
  }
});

test("connection check uses current structured-output parameters, minimal text and header-only credentials", async () => {
  const checked = await checkGeminiConnection({
    key: ` ${key} `,
    model: "models/gemini-3.8-flash",
    fetcher: (async (url, options) => {
      assert.equal(
        String(url),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      );
      assert.equal(new Headers(options?.headers).get("x-goog-api-key"), key);
      assert.ok(!String(options?.body).includes(key));
      const body = JSON.parse(String(options?.body));
      for (const retired of ["temperature", "topP", "topK"])
        assert.ok(!(retired in body.generationConfig));
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "LOW");
      assert.equal(body.generationConfig.maxOutputTokens, 2048);
      assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), {
        check: "Return ok=true.",
      });
      return envelope({ ok: true });
    }) as typeof fetch,
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.mode, "gemini");
});

test("provider errors are actionable and never echo provider details or secrets", async () => {
  const cases: [number, RegExp][] = [
    [403, /authenticate/i],
    [404, /model/i],
    [429, /quota/i],
    [500, /temporarily/i],
  ];
  for (const [status, message] of cases) {
    await assert.rejects(
      () =>
        requestJson(
          {
            key,
            fetcher: (async () =>
              Response.json(
                { error: { message: key } },
                { status },
              )) as typeof fetch,
          },
          "probe",
          {},
          schema,
        ),
      (error: unknown) => {
        assert.ok(error instanceof InputError);
        assert.match(error.message, message);
        assert.ok(!error.message.includes(key));
        return true;
      },
    );
  }
  await assert.rejects(
    () =>
      requestJson(
        {
          key,
          fetcher: (async () => {
            throw new TypeError(key);
          }) as typeof fetch,
        },
        "probe",
        {},
        schema,
      ),
    /could not reach Gemini/,
  );
  await assert.rejects(
    () =>
      requestJson(
        {
          key,
          fetcher: (async () =>
            Response.json({
              promptFeedback: { blockReason: "SAFETY" },
            })) as typeof fetch,
        },
        "probe",
        {},
        schema,
      ),
    /declined to process/,
  );
  await assert.rejects(
    () =>
      checkGeminiConnection({
        key,
        fetcher: (async () => envelope({ ok: false })) as typeof fetch,
      }),
    /could not be validated/,
  );
});
