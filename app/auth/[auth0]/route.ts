// app/auth/[auth0]/route.ts
import { getAuth0Config } from "../../../lib/auth0";
import { signSession } from "../../../lib/session";
import { bindings } from "../../../lib/store";

// The public address of this app: APP_BASE_URL if set, otherwise the address
// the browser used (works on Vercel, preview links, tunnels and localhost).
function baseUrlFor(request: Request, configured: string): string {
  if (configured) return configured.replace(/\/+$/, "");
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    new URL(request.url).protocol.replace(":", "");
  return host ? `${proto}://${host.split(",")[0].trim()}` : new URL(request.url).origin;
}
const secure = (base: string) => (base.startsWith("https://") ? "; Secure" : "");

function redirectWithCookie(url: string, cookieHeader: string): Response {
  const headers = new Headers();
  headers.set("Location", url);
  headers.set("Set-Cookie", cookieHeader);
  return new Response(null, {
    status: 302,
    headers,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = getAuth0Config();
  const env = bindings();
  config.baseUrl = baseUrlFor(
    request,
    env.APP_BASE_URL || (typeof process !== "undefined" ? process.env.APP_BASE_URL || "" : ""),
  );
  const action = url.pathname.split("/").pop();

  if ((action === "login" || action === "callback") && (!config.domain || !config.clientId))
    return new Response(
      "<h1>Auth0 isn't set up yet</h1><p>Add AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET and AUTH0_SECRET to .env.local (local) or to your Vercel project's Environment Variables, then restart or redeploy.</p>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );

  if (action === "login") {
    const authUrl =
      `https://${config.domain}/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: `${config.baseUrl}/auth/callback`,
        scope: "openid profile email",
        ...(url.searchParams.get("screen_hint") === "signup"
          ? { screen_hint: "signup" }
          : {}),
      }).toString();

    return Response.redirect(authUrl, 302);
  }

  if (action === "callback") {
    const code = url.searchParams.get("code");
    if (!code) {
      return Response.redirect(`${config.baseUrl}?error=missing_code`, 302);
    }

    try {
      const tokenRes = await fetch(`https://${config.domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: `${config.baseUrl}/auth/callback`,
        }),
      });

      const tokens = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
      };
      if (!tokenRes.ok || !tokens.access_token) {
        console.error("Auth0 Token Error:", tokens);
        return Response.redirect(`${config.baseUrl}?error=token_failed`, 302);
      }

      const userRes = await fetch(`https://${config.domain}/userinfo`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const user = (await userRes.json()) as Record<string, unknown>;

      const secret = env.AUTH0_SECRET || env.AUTH0_CLIENT_SECRET || config.clientSecret;
      if (!user?.sub || !secret)
        return Response.redirect(`${config.baseUrl}?error=auth_failed`, 302);
      // Signed so it cannot be edited to become another family.
      const cookieValue = await signSession(
        {
          sub: String(user.sub),
          name: typeof user.name === "string" ? user.name : undefined,
          email: typeof user.email === "string" ? user.email : undefined,
          picture: typeof user.picture === "string" ? user.picture : undefined,
        },
        secret,
      );

      return redirectWithCookie(
        config.baseUrl,
        `kincard_session=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure(config.baseUrl)}`,
      );
    } catch (e) {
      console.error("Auth0 Callback Exception:", e);
      return Response.redirect(`${config.baseUrl}?error=auth_failed`, 302);
    }
  }

  if (action === "logout") {
    const domain = config.domain || process.env.AUTH0_DOMAIN || "";
    const clientId = config.clientId || process.env.AUTH0_CLIENT_ID || "";
    const baseUrl = config.baseUrl;

    const targetUrl =
      domain && clientId
        ? `https://${domain}/v2/logout?` +
          new URLSearchParams({
            client_id: clientId,
            returnTo: baseUrl,
          }).toString()
        : baseUrl;

    return redirectWithCookie(
      targetUrl,
      "kincard_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

export const POST = GET;