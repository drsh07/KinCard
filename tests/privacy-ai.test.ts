import test from "node:test";
import assert from "node:assert/strict";
import { aiPrivacyScreen, onlyRemoved } from "../lib/privacy-ai.ts";
import { transcribeAudio } from "../lib/transcribe.ts";

const envelope = (value: unknown) =>
  Response.json({
    candidates: [
      { finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } },
    ],
  });
const gemini = (reply: unknown, seen?: unknown[]) => ({
  key: "fictional-privacy-test-key",
  model: "gemini-3.1-flash-lite",
  fetcher: (async (_url: string, init: RequestInit) => {
    seen?.push(JSON.parse(String(init.body)));
    return envelope(reply);
  }) as unknown as typeof fetch,
});

test("only-removed check: removals pass, added or reworded words fail", () => {
  const before = "Nurse Priya gave Maggie tea. Robert from room 214 was loud.";
  assert.ok(onlyRemoved(before, "Nurse [removed] gave Maggie tea. [removed] from room [removed] was loud."));
  assert.ok(!onlyRemoved(before, "A nurse gave Maggie some tea."));
  assert.ok(!onlyRemoved(before, "[removed]"));
});

test("Gemini removes names and room numbers the pattern filter can't catch", async () => {
  const seen: unknown[] = [];
  const result = await aiPrivacyScreen(
    "Nurse Priya says Maggie enjoyed tea. Robert from room 214 was loud. Call 604-555-0199.",
    ["Maggie", "Margaret", "Morgan"],
    gemini(
      {
        text: "Nurse [removed] says Maggie enjoyed tea. [removed] from room [removed] was loud. Call [removed].",
        removed: ["staff name", "other person's name", "room or unit number"],
      },
      seen,
    ),
  );
  assert.equal(result.mode, "gemini");
  assert.ok(!/Priya|Robert|214|604/.test(result.text));
  assert.match(result.text, /Maggie enjoyed tea/);
  assert.ok(result.findings.some((f) => /staff member's name/.test(f.label)));
  assert.ok(result.findings.some((f) => /Telephone/.test(f.label)), "pattern filter still runs first");
  // The phone number never reached Gemini: the pattern filter ran first.
  assert.ok(!JSON.stringify(seen).includes("604-555-0199"));
});

test("if Gemini rewrites instead of only removing, the basic filter result is used", async () => {
  const result = await aiPrivacyScreen(
    "Nurse Priya says Maggie enjoyed tea.",
    ["Maggie"],
    gemini({ text: "A staff member reported that the resident liked her drink.", removed: [] }),
  );
  assert.equal(result.mode, "local");
  assert.match(result.text, /Priya/);
  assert.match(result.notice, /changed more than identifiers/);
});

test("without a Gemini key, the basic filter still works", async () => {
  const result = await aiPrivacyScreen("Call me at 604-555-0199 about Maggie.", [], {});
  assert.equal(result.mode, "local");
  assert.ok(!result.text.includes("604-555-0199"));
});

test("Gemini transcribes an English recording; the audio is sent as media", async () => {
  const seen: { contents: { parts: Record<string, unknown>[] }[] }[] = [];
  const result = await transcribeAudio(
    { mimeType: "audio/webm;codecs=opus", data: "AAAA" },
    gemini(
      {
        language: "English",
        transcript: "She smiled when we sang folk songs.",
        english: "She smiled when we sang folk songs.",
      },
      seen,
    ),
  );
  assert.equal(result.text, "She smiled when we sang folk songs.");
  assert.equal(result.translated, false);
  assert.deepEqual(seen[0].contents[0].parts[0], {
    inlineData: { mimeType: "audio/webm", data: "AAAA" },
  });
});

test("transcription rejects missing key, odd formats and oversized audio clearly", async () => {
  await assert.rejects(transcribeAudio({ mimeType: "audio/webm", data: "AAAA" }, {}), /need Gemini/);
  const config = gemini({ transcript: "x" });
  await assert.rejects(transcribeAudio({ mimeType: "video/mp4", data: "AAAA" }, config), /format/);
  await assert.rejects(
    transcribeAudio({ mimeType: "audio/mp4", data: "A".repeat(5_600_000) }, config),
    /too long/,
  );
});

test("speech in another language is turned into English, keeping the original", async () => {
  const result = await transcribeAudio(
    { mimeType: "audio/mp4", data: "AAAA" },
    gemini({
      language: "Mandarin",
      transcript: "她看到花园的照片时笑了。",
      english: "She smiled when she saw the garden photos.",
    }),
  );
  assert.equal(result.text, "She smiled when she saw the garden photos.");
  assert.equal(result.language, "Mandarin");
  assert.equal(result.translated, true);
  assert.equal(result.original, "她看到花园的照片时笑了。");
});
