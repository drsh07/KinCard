import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureLocalConfig } from "../scripts/local-config.mjs";

test("fresh clone works without hidden hosting files", () => {
  const root = mkdtempSync(join(tmpdir(), "kincard-team-"));
  try {
    assert.deepEqual(ensureLocalConfig(root), { d1: "DB", r2: null });
    assert.deepEqual(ensureLocalConfig(root), { d1: "DB", r2: null });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("local setup never replaces an existing hosted Site identity", () => {
  const root = mkdtempSync(join(tmpdir(), "kincard-team-"));
  try {
    mkdirSync(join(root, ".openai"));
    const file = join(root, ".openai/hosting.json");
    const original = '{"project_id":"existing-site","d1":"DB","r2":null}';
    writeFileSync(file, original);
    ensureLocalConfig(root);
    assert.equal(readFileSync(file, "utf8"), original);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
