import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import { ensureLocalConfig } from "./scripts/local-config.mjs";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { sites } from "./scripts/vite/sites-vite-plugin";
import { connectorPreview } from "./scripts/vite/connector-preview-plugin.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = ensureLocalConfig();

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command, mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), "");
  configureToolEnvironment(process.cwd());

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      // The local D1 database lives in .wrangler; watching it reloads the page on every query.
      watch: { ignored: ["**/.wrangler/**"] },
      // Let phones reach the dev server through a tunnel or the Wi-Fi IP.
      allowedHosts: true as const,
      ...(managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : {}),
      ...(isCodexSeatbeltSandbox
        ? { watch: { ignored: ["**/.wrangler/**"], useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      connectorPreview(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          ...localBindingConfig,
          ...(command === "serve"
            ? {
                vars: {
                  GEMINI_API_KEY: localEnv.GEMINI_API_KEY || "",
                  GEMINI_MODEL: localEnv.GEMINI_MODEL || "gemini-3.8-flash",
                  // Optional Databricks storage. Leave unset to use the local demo DB.
                  DATABRICKS_HOST: localEnv.DATABRICKS_HOST || "",
                  // Auth0 sign-in for local dev (on Vercel these are project settings).
                  AUTH0_DOMAIN: localEnv.AUTH0_DOMAIN || "",
                  AUTH0_CLIENT_ID: localEnv.AUTH0_CLIENT_ID || "",
                  AUTH0_CLIENT_SECRET: localEnv.AUTH0_CLIENT_SECRET || "",
                  AUTH0_SECRET: localEnv.AUTH0_SECRET || "",
                  APP_BASE_URL: localEnv.APP_BASE_URL || "",
                  DATABRICKS_TOKEN: localEnv.DATABRICKS_TOKEN || "",
                  DATABRICKS_WAREHOUSE_ID: localEnv.DATABRICKS_WAREHOUSE_ID || "",
                  DATABRICKS_TABLE: localEnv.DATABRICKS_TABLE || "",
                  DATABRICKS_CATALOG: localEnv.DATABRICKS_CATALOG || "",
                  DATABRICKS_SCHEMA: localEnv.DATABRICKS_SCHEMA || "",
                },
                services: [
                  {
                    binding: "CONNECTORS",
                    service: "sites-connector-preview",
                    entrypoint: "ConnectorPreview",
                  },
                ],
              }
            : {}),
        },
        ...(command === "serve"
          ? {
              auxiliaryWorkers: [
                {
                  config: {
                    name: "sites-connector-preview",
                    main: "./scripts/connector-preview/worker.mjs",
                    compatibility_date: "2026-05-15",
                  },
                },
              ],
            }
          : {}),
      }),
    ],
  };
});
