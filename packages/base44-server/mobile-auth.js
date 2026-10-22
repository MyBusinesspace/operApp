/**
 * Mobile session helpers (HMAC tokens issued by apiAuth). Kept here so Vercel
 * can serve paginated entityQuery without editing base44/functions sources.
 */
import { env } from "./env.js";
import { createClient } from "./sdk.js";

function base64UrlEncode(input) {
  const bytes = typeof input === "string" ? Buffer.from(input) : Buffer.from(input);
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from((value + pad).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function sessionSecret(request) {
  return (
    env("OTP_SECRET") ||
    request.headers.get("x-app-id") ||
    request.headers.get("X-App-Id") ||
    env("VITE_BASE44_APP_ID", "operapp")
  );
}

export function platformOwnerUserId() {
  return env("PLATFORM_OWNER_USER_ID", "6a201f5ce89c0f167dbe847e").trim();
}

export async function verifyMobileAuthToken(request, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) throw new Error("Invalid session token");
  const [body, signature] = parts;
  const expected = base64UrlEncode(await hmacSign(body, sessionSecret(request)));
  if (signature !== expected) throw new Error("Invalid session token");

  const payload = JSON.parse(base64UrlDecode(body));
  if (!payload?.exp || Date.now() > payload.exp) {
    throw new Error("Session has expired. Please sign in again.");
  }
  if (payload.type !== "mobile_auth" || !payload.employee_id) {
    throw new Error("Invalid mobile session");
  }
  const ownerId = platformOwnerUserId();
  if (payload.owner_user_id && payload.owner_user_id !== ownerId) {
    throw new Error("Session owner mismatch. Please sign in again.");
  }
  return payload;
}

export function readMobileAuthToken(request, body = {}) {
  return (
    request.headers.get("x-mobile-auth") ||
    request.headers.get("X-Mobile-Auth") ||
    body.mobile_token ||
    null
  );
}

export async function authenticateMobileEmployee(request, body = {}) {
  const token = readMobileAuthToken(request, body);
  if (!token) {
    return { error: Response.json({ error: "Missing X-Mobile-Auth header." }, { status: 401 }) };
  }

  let payload;
  try {
    payload = await verifyMobileAuthToken(request, token);
  } catch (error) {
    return { error: Response.json({ error: error.message }, { status: 401 }) };
  }

  const headerEmployeeId =
    request.headers.get("X-Employee-ID") || request.headers.get("x-employee-id") || "";
  if (headerEmployeeId && headerEmployeeId !== payload.employee_id) {
    return { error: Response.json({ error: "Employee ID mismatch." }, { status: 403 }) };
  }

  const base44 = createClient({ accessToken: null });
  const rows = await base44.asServiceRole.entities.Employee.filter({ id: payload.employee_id });
  const employee = rows?.[0];
  if (!employee) {
    return { error: Response.json({ error: "Employee not found." }, { status: 404 }) };
  }
  if (employee.status === "Inactive" || employee.status === "Terminated") {
    return { error: Response.json({ error: "This employee account is not active." }, { status: 403 }) };
  }

  return {
    employee,
    employeeId: employee.id,
    actingUserId: platformOwnerUserId(),
    base44,
  };
}
