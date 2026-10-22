import { saveAccessToken, removeAccessToken } from "./utils/auth-utils.js";

const SUPABASE_STORAGE_KEY = "operapp-auth";

/**
 * Placeholder written while an OAuth redirect is still being exchanged for a
 * session. `app-params` only checks that a token exists, and `auth.me()` waits
 * for the real session, so the app no longer needs a second login attempt.
 */
export const PENDING_OAUTH_TOKEN = "pending-oauth-exchange";

function readStoredSessionToken() {
  try {
    const raw = window.localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token || parsed?.currentSession?.access_token || null;
  } catch {
    return null;
  }
}

export function hasPendingOAuthCallback() {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).has("code")) return true;
    const hash = new URLSearchParams(String(window.location.hash).replace(/^#/, ""));
    return hash.has("access_token");
  } catch {
    return false;
  }
}

export function clearStoredSession() {
  removeAccessToken();
  try {
    window.localStorage.removeItem(SUPABASE_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

let bootedWithOAuthCallback = false;

/** URL params are cleaned up once Supabase finishes the exchange, so latch it. */
export function startedWithOAuthCallback() {
  return bootedWithOAuthCallback;
}

/**
 * Must run before `@/lib/app-params` reads localStorage, otherwise the app boots
 * as signed-out even though Supabase has a valid session.
 */
export function primeLegacyToken() {
  if (typeof window === "undefined") return;

  bootedWithOAuthCallback = hasPendingOAuthCallback();

  const stored = readStoredSessionToken();
  if (stored) {
    saveAccessToken(stored);
    return;
  }
  if (bootedWithOAuthCallback) {
    saveAccessToken(PENDING_OAUTH_TOKEN);
    return;
  }
  removeAccessToken();
}

primeLegacyToken();
