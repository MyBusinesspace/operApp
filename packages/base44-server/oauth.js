/**
 * Google sign-in entry points that mirror the Base44 platform URLs the mobile
 * app already calls:
 *
 *   GET /api/apps/auth/login?app_id=..&from_url=..   → Supabase Google consent
 *   GET /api/apps/auth/callback?code=..              → 302 to from_url?access_token=..
 *
 * PKCE is driven from here (verifier kept in a short-lived HttpOnly cookie), so
 * the access token is exchanged server-side and never lands in a URL fragment.
 */
import crypto from "node:crypto";

import { appOrigin, env, supabaseConfig } from "./env.js";

const VERIFIER_COOKIE = "operapp_pkce";
const RETURN_COOKIE = "operapp_oauth_return";
// Generous, because Google may interrupt with a passkey or 2FA challenge.
const COOKIE_TTL_SECONDS = 1800;

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function cookie(name, value, maxAge) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (env("VERCEL")) attributes.push("Secure");
  return attributes.join("; ");
}

function errorPage(message, status = 400) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Sign-in failed</title>` +
      `<body style="font-family:system-ui;padding:24px"><h3>Sign-in failed</h3><p>${message}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function redirectWithToken(returnUrl, params) {
  const target = new URL(returnUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) target.searchParams.set(key, value);
  }
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

function startLogin(request) {
  const url = new URL(request.url);
  const fromUrl = url.searchParams.get("from_url");
  if (!fromUrl) return errorPage("Missing from_url parameter.");

  const { url: supabaseUrl } = supabaseConfig();
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());

  const callback = `${appOrigin(request)}/api/apps/auth/callback`;
  const authorize = new URL(`${supabaseUrl}/auth/v1/authorize`);
  authorize.searchParams.set("provider", "google");
  authorize.searchParams.set("redirect_to", callback);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "s256");

  const headers = new Headers({ Location: authorize.toString() });
  headers.append("Set-Cookie", cookie(VERIFIER_COOKIE, verifier, COOKIE_TTL_SECONDS));
  headers.append("Set-Cookie", cookie(RETURN_COOKIE, fromUrl, COOKIE_TTL_SECONDS));
  console.log("[oauth] start", { callback, fromUrl });
  return new Response(null, { status: 302, headers });
}

async function exchangeCode(code, verifier) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    // GoTrue reports errors as error_description, msg or message depending on the case.
    const reason =
      data?.error_description || data?.msg || data?.message || `HTTP ${response.status}`;
    throw new Error(`Token exchange failed: ${reason}`);
  }
  return data.access_token;
}

async function finishLogin(request) {
  const url = new URL(request.url);
  const returnUrl = readCookie(request, RETURN_COOKIE);
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const code = url.searchParams.get("code");

  // The mobile flow is invisible from the client side, so leave a trail here.
  console.log("[oauth] callback", {
    hasCode: Boolean(code),
    hasReturnCookie: Boolean(returnUrl),
    hasVerifierCookie: Boolean(readCookie(request, VERIFIER_COOKIE)),
    params: [...url.searchParams.keys()],
    oauthError: oauthError || null,
  });

  if (!returnUrl) return errorPage("Sign-in session expired. Start again from the app.");
  if (oauthError) return redirectWithToken(returnUrl, { error: oauthError });

  if (!code) {
    // Implicit grant puts the token in the fragment, which never reaches the
    // server — bounce it back through the browser.
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Signing in…</title><script>
        var hash = new URLSearchParams(location.hash.replace(/^#/, ""));
        var token = hash.get("access_token");
        var target = new URL(${JSON.stringify(returnUrl)});
        target.searchParams.set(token ? "access_token" : "error", token || "Missing access token.");
        location.replace(target.toString());
      </script>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const verifier = readCookie(request, VERIFIER_COOKIE);
  if (!verifier) return errorPage("Sign-in session expired. Start again from the app.");

  try {
    const accessToken = await exchangeCode(code, verifier);
    console.log("[oauth] exchanged", { tokenLength: accessToken.length });
    return redirectWithToken(returnUrl, { access_token: accessToken });
  } catch (error) {
    console.error("[oauth] exchange failed", error.message);
    return redirectWithToken(returnUrl, { error: error.message });
  }
}

export async function handleAuthRequest(request, segments) {
  const action = segments[0];
  if (action === "login") return startLogin(request);
  if (action === "callback") return finishLogin(request);
  return new Response(JSON.stringify({ error: "Unknown auth route" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
