import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Hosting metadata is optional for teammates running the app locally.
// Preserve existing Site identity and bindings when this file is present.
export function ensureLocalConfig(root = process.cwd()) {
  const directory = join(root, ".openai");
  const file = join(directory, "hosting.json");
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(file, JSON.stringify({ d1: "DB", r2: null }, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  return JSON.parse(readFileSync(file, "utf8"));
}
