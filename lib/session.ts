// Signed login cookie for Auth0 users. The cookie holds only the user's id,
// name, email and picture, plus an HMAC signature made with AUTH0_SECRET (or
// the client secret), so it cannot be edited to impersonate another family.

export type SessionUser = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
};

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (value: string) =>
  Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(user: SessionUser, secret: string): Promise<string> {
  const payload = b64url(
    enc.encode(
      JSON.stringify({
        sub: user.sub,
        name: user.name,
        email: user.email,
        picture: user.picture,
        iat: Date.now(),
      }),
    ),
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload)),
  );
  return `${payload}.${b64url(sig)}`;
}

export async function readSession(
  cookie: string | undefined,
  secret: string,
): Promise<SessionUser | null> {
  if (!cookie || !secret) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      fromB64url(sig),
      enc.encode(payload),
    );
    if (!ok) return null;
    const user = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof user?.sub === "string" && user.sub ? (user as SessionUser) : null;
  } catch {
    return null;
  }
}
