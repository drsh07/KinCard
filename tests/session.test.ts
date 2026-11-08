import test from "node:test";
import assert from "node:assert/strict";
import { readSession, signSession } from "../lib/session.ts";
import { householdFor, householdOfToken, newQrToken } from "../lib/household.ts";

test("login cookie is signed: edits and wrong secrets are rejected", async () => {
  const cookie = await signSession({ sub: "auth0|alice", name: "Alice" }, "s3cret");
  assert.equal((await readSession(cookie, "s3cret"))?.sub, "auth0|alice");
  assert.equal(await readSession(cookie, "other-secret"), null);
  const [payload, sig] = cookie.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "auth0|mallory" })).toString("base64url");
  assert.equal(await readSession(`${forged}.${sig}`, "s3cret"), null);
  assert.equal(await readSession(`${payload}.`, "s3cret"), null);
  assert.equal(await readSession(undefined, "s3cret"), null);
});

test("each account maps to its own private household and QR tokens", async () => {
  const a = await householdFor("auth0|alice");
  assert.equal(a, await householdFor("auth0|alice"));
  assert.notEqual(a, await householdFor("auth0|bob"));
  assert.ok(!a.includes("alice"));
  assert.equal(householdOfToken(newQrToken(a)), a);
  assert.equal(householdOfToken(crypto.randomUUID()), "demo");
});
