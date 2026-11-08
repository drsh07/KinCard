import { ensureLocalConfig } from "./local-config.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
ensureLocalConfig(root);
await mkdir(resolve(root, ".sites-runtime"), { recursive: true });
const configPath = resolve(root, ".sites-runtime/local-db.json");
await writeFile(configPath, JSON.stringify({
  name: "kincard-local-db", compatibility_date: "2026-05-15",
  d1_databases: [{ binding: "DB", database_name: "site-creator-d1", database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: resolve(root, "drizzle") }],
}, null, 2));
const result = spawnSync(process.execPath, ["--import", resolve(root, "scripts/sites-env.mjs"), resolve(root, "node_modules/wrangler/bin/wrangler.js"), "d1", "migrations", "apply", "DB", "--local", "--config", configPath, "--persist-to", resolve(root, ".wrangler/state")], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("KinCard demo database is ready. Run npm run dev.");
