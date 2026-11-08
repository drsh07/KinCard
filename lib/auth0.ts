// lib/auth0.ts
import { bindings } from "./store";

export function getAuth0Config() {
  const envVars = bindings();
  return {
    // Accept "dev-x.us.auth0.com" or "https://dev-x.us.auth0.com/".
    domain: (envVars.AUTH0_DOMAIN || process.env.AUTH0_DOMAIN || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, ""),
    clientId: envVars.AUTH0_CLIENT_ID || process.env.AUTH0_CLIENT_ID || "",
    clientSecret: envVars.AUTH0_CLIENT_SECRET || process.env.AUTH0_CLIENT_SECRET || "",
    baseUrl: envVars.APP_BASE_URL || process.env.APP_BASE_URL || "",
  };
}