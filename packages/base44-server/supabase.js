import { createClient } from "@supabase/supabase-js";

import { supabaseConfig } from "./env.js";

let _serviceClient = null;

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

/** Full-access client — mirrors `base44.asServiceRole`. */
export function getServiceClient() {
  if (_serviceClient) return _serviceClient;
  const { url, serviceRoleKey, anonKey } = supabaseConfig();
  _serviceClient = createClient(url, serviceRoleKey || anonKey, clientOptions);
  return _serviceClient;
}

/** Caller-scoped client (RLS applies) — mirrors the plain `base44.entities`. */
export function getUserClient(accessToken) {
  const { url, anonKey, serviceRoleKey } = supabaseConfig();
  const key = anonKey || serviceRoleKey;
  if (!accessToken) return createClient(url, key, clientOptions);
  return createClient(url, key, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** PascalCase entity → snake_case table (User → users). */
export function entityToTable(entityName) {
  if (entityName === "User") return "users";
  return entityName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}
