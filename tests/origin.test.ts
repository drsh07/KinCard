import test from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../lib/origin.ts";

const req = (url: string, headers: Record<string, string>) =>
  new Request(url, { method: "POST", headers });

test("same-site POSTs pass on localhost, tunnels and Vercel; other sites are blocked", () => {
  assert.ok(sameOrigin(req("http://127.0.0.1:5173/api/login", { origin: "http://127.0.0.1:5173" })));
  assert.ok(sameOrigin(req("http://127.0.0.1:5173/api/login", {})));
  // Vercel / proxies: the app sees an internal URL; the browser used the public one.
  assert.ok(
    sameOrigin(
      req("http://localhost:3000/api/login", {
        origin: "https://kincard.vercel.app",
        "x-forwarded-host": "kincard.vercel.app",
      }),
    ),
  );
  assert.ok(
    sameOrigin(req("http://localhost:3000/api/login", { origin: "https://abc.trycloudflare.com", host: "abc.trycloudflare.com" })),
  );
  // Cross-site attempts are refused.
  assert.ok(
    !sameOrigin(
      req("http://localhost:3000/api/login", {
        origin: "https://evil.example",
        "x-forwarded-host": "kincard.vercel.app",
      }),
    ),
  );
  assert.ok(!sameOrigin(req("http://localhost:3000/api/login", { origin: "not a url" })));
});
