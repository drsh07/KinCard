// app/auth/[auth0]/route.ts
import { getAuth0Config } from "../../../lib/auth0";

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
  const action = url.pathname.split("/").pop();

  if (action === "login") {
    const authUrl =
      `https://${config.domain}/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: `${config.baseUrl}/auth/callback`,
        scope: "openid profile email",
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

      const cookieValue = Buffer.from(JSON.stringify(user)).toString("base64");

      return redirectWithCookie(
        config.baseUrl,
        `kincard_session=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
      );
    } catch (e) {
      console.error("Auth0 Callback Exception:", e);
      return Response.redirect(`${config.baseUrl}?error=auth_failed`, 302);
    }
  }

  if (action === "logout") {
    const domain = config.domain || process.env.AUTH0_DOMAIN || "";
    const clientId = config.clientId || process.env.AUTH0_CLIENT_ID || "";
    const baseUrl = config.baseUrl || process.env.APP_BASE_URL || "http://localhost:5173";

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