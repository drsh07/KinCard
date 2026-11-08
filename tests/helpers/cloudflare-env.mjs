// Installed by api-gemini.test.mjs before importing real API route handlers.
export const env = globalThis.__kinCardApiTestBindings;
if (!env)
  throw new Error("The test-only Cloudflare binding was not initialized.");
