/**
 * Server-side environment access for the Base44-compatible API layer.
 *
 * Vercel functions read plain (unprefixed) variables; the VITE_ names are accepted
 * as a fallback so a single local .env file drives both the web app and the API.
 */

export function env(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === null || value === "" ? fallback : value;
}

export function supabaseConfig() {
  const url = env("SUPABASE_URL", env("VITE_SUPABASE_URL"));
  const anonKey = env("SUPABASE_ANON_KEY", env("VITE_SUPABASE_ANON_KEY"));
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = env(
    "SUPABASE_STORAGE_BUCKET",
    env("VITE_SUPABASE_STORAGE_BUCKET", "uploads")
  );

  if (!url) throw new Error("SUPABASE_URL is not set on the server.");
  if (!serviceRoleKey && !anonKey) {
    throw new Error("Set SUPABASE_SERVICE_ROLE_KEY (or at least SUPABASE_ANON_KEY).");
  }

  return { url, anonKey, serviceRoleKey, bucket };
}

/** Public origin of this deployment, used to build OAuth redirect URLs. */
export function appOrigin(request) {
  const configured = env("APP_URL", env("VITE_APP_URL"));
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = env("VERCEL_URL");
  if (vercelUrl) return `https://${vercelUrl}`;
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      /* fall through */
    }
  }
  return "http://localhost:3000";
}
