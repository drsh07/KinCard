// Each Auth0 account owns one household (care card). The id is a one-way
// hash of the Auth0 user id, so it reveals nothing about the account and is
// safe to put inside a QR link.

export async function householdFor(sub: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`kincard:${sub}`),
  );
  return `u${[...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** QR tokens look like "<household>.<secret>". Older plain tokens belong to the
 * fictional demo card. */
export function householdOfToken(token: string): string {
  const [prefix, secret] = token.split(".");
  if (secret && /^[a-z0-9]{1,40}$/.test(prefix)) return prefix;
  return "demo";
}

export function newQrToken(household: string): string {
  return `${household}.${crypto.randomUUID()}`;
}
