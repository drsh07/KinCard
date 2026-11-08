// lib/auth0.ts
import { bindings } from "./store";

export function getAuth0Config() {
  const envVars = bindings();
  return {
    domain: envVars.AUTH0_DOMAIN || process.env.AUTH0_DOMAIN || "",
    clientId: envVars.AUTH0_CLIENT_ID || process.env.AUTH0_CLIENT_ID || "",
    clientSecret: envVars.AUTH0_CLIENT_SECRET || process.env.AUTH0_CLIENT_SECRET || "",
    baseUrl: envVars.APP_BASE_URL || process.env.APP_BASE_URL || "http://localhost:5173",
  };
}