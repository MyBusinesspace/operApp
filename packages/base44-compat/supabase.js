import { createClient } from "@supabase/supabase-js";

let _client = null;

export function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL || "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

export function getSupabase() {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local"
    );
  }
  if (!_client) {
    _client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "operapp-auth",
      },
    });
  }
  return _client;
}

/** PascalCase entity → snake_case table (User → users). */
export function entityToTable(entityName) {
  if (entityName === "User") return "users";
  return entityName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}
