import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// Wrangler otherwise looks beside dist/server/wrangler.json for .env.local.
// Pass file paths, never secret values, and leave the build free of local keys.
export function previewArguments(root, extra = []) {
  return [
    "--import",
    join(root, "scripts/sites-env.mjs"),
    join(root, "node_modules/wrangler/bin/wrangler.js"),
    "dev",
    "--config",
    join(root, "dist/server/wrangler.json"),
    "--local",
    "--persist-to",
    join(root, ".wrangler/state"),
    "--ip",
    "127.0.0.1",
    "--inspector-port",
    "0",
    ...[".env", ".env.local"]
      .map((name) => join(root, name))
      .filter(existsSync)
      .flatMap((file) => ["--env-file", file]),
    ...extra,
  ];
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!existsSync(join(projectRoot, "dist/server/wrangler.json"))) {
    console.error("Build KinCard first: npm run build. Then run npm start.");
    process.exitCode = 1;
  } else {
    const result = spawnSync(
      process.execPath,
      previewArguments(projectRoot, process.argv.slice(2)),
      {
        cwd: projectRoot,
        env: process.env,
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
}
