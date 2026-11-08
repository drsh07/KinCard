import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { previewArguments } from "../scripts/start-preview.mjs";

test("built local preview loads root environment files without copying keys into arguments", () => {
  const root = mkdtempSync(join(tmpdir(), "kincard-env-"));
  writeFileSync(join(root, ".env"), "GEMINI_MODEL=gemini-3.8-flash\n");
  writeFileSync(
    join(root, ".env.local"),
    "GEMINI_API_KEY=fictional-test-value\n",
  );
  try {
    const args = previewArguments(root, ["--port", "5178"]);
    const files = args.flatMap((arg, index) =>
      arg === "--env-file" ? [args[index + 1]] : [],
    );
    assert.deepEqual(files, [join(root, ".env"), join(root, ".env.local")]);
    assert.equal(
      args[args.indexOf("--config") + 1],
      join(root, "dist/server/wrangler.json"),
    );
    assert.equal(
      args[args.indexOf("--persist-to") + 1],
      join(root, ".wrangler/state"),
    );
    assert.ok(args.includes("--local"));
    assert.equal(args[args.indexOf("--ip") + 1], "127.0.0.1");
    assert.deepEqual(args.slice(-2), ["--port", "5178"]);
    assert.equal(
      args.some((arg) => arg.includes("GEMINI_API_KEY=")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("built preview does not pass missing optional dotenv files to Node or Wrangler", () => {
  const root = mkdtempSync(join(tmpdir(), "kincard-empty-env-"));
  try {
    assert.ok(!previewArguments(root).includes("--env-file"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
