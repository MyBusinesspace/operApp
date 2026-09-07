import { createAuthModule } from "./modules/auth.js";
import { createEntitiesModule } from "./modules/entities.js";
import { createFunctionsModule } from "./modules/functions.js";
import { createIntegrationsModule } from "./modules/integrations.js";
import { createUsersModule } from "./modules/users.js";
import { getAccessToken, saveAccessToken, removeAccessToken } from "./utils/auth-utils.js";
import { getSupabase, getSupabaseConfig } from "./supabase.js";

/**
 * Drop-in replacement for @base44/sdk createClient — backed by Supabase.
 */
export function createClient(config = {}) {
  // Clear legacy Base44 tokens immediately so AuthContext does not treat them as a session.
  // A real Supabase session is restored below and re-saved to the legacy key.
  if (!config.token) {
    removeAccessToken();
  } else {
    saveAccessToken(config.token);
  }

  const { configured } = getSupabaseConfig();
  if (configured) {
    try {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session?.access_token) {
          saveAccessToken(data.session.access_token);
        }
      });
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) saveAccessToken(session.access_token);
        else removeAccessToken();
      });
    } catch (e) {
      console.warn("[compat] supabase session hydrate failed", e);
    }
  }

  const auth = createAuthModule({
    serverUrl: config.serverUrl,
    appBaseUrl: config.appBaseUrl || (typeof window !== "undefined" ? window.location.origin : ""),
    token: config.token || getAccessToken(),
  });

  const entities = createEntitiesModule();
  const functions = createFunctionsModule();
  const integrations = createIntegrationsModule();
  const users = createUsersModule();

  const client = {
    auth,
    entities,
    functions,
    integrations,
    users,
    agents: {},
    connectors: {},
    appLogs: {},
    analytics: { track() {} },
    app: {
      async getPublicSettings() {
        return {
          id: config.appId || "operapp",
          public_settings: { auth_required: true, app_name: "Operapp" },
        };
      },
    },
  };

  client.asServiceRole = {
    entities,
    functions,
    integrations,
    auth,
  };

  return client;
}

/**
 * Backend helper stub — real service-role clients belong in Supabase Edge Functions.
 */
export function createClientFromRequest(_request) {
  console.warn(
    "[compat] createClientFromRequest should run in Edge Functions with the service role key"
  );
  return createClient({});
}
