/**
 * Drop-in replacement for `npm:@base44/sdk` inside the exported Base44 backend
 * functions. The build step rewrites their import specifier to this module, so
 * `base44/functions/**` can be re-exported from Base44 without any edits.
 *
 * Implements the surface those functions actually use:
 *   base44.auth.me()
 *   base44.entities.<Entity>.<op>()          (caller-scoped, RLS applies)
 *   base44.integrations.Core.<op>()
 *   base44.asServiceRole.entities / integrations   (full access)
 */
import { createAuthModule, resolveUser } from "./auth.js";
import { createEntitiesModule } from "./entities.js";
import { createIntegrationsModule } from "./integrations.js";
import { getServiceClient, getUserClient } from "./supabase.js";

export function bearerToken(request) {
  const header =
    request?.headers?.get?.("authorization") || request?.headers?.get?.("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function createClient({ accessToken = null, appId = null } = {}) {
  const serviceClient = getServiceClient();
  const userClient = getUserClient(accessToken);

  // Cached so entity writes can stamp created_by once the caller is known.
  let cachedUser = null;
  const callerRef = () => cachedUser;

  const auth = createAuthModule(() => accessToken);
  const wrappedAuth = {
    ...auth,
    async me() {
      const user = await auth.me();
      cachedUser = user;
      return user;
    },
    async isAuthenticated() {
      cachedUser = await resolveUser(accessToken);
      return Boolean(cachedUser);
    },
  };

  return {
    appId,
    auth: wrappedAuth,
    entities: createEntitiesModule(userClient, callerRef),
    integrations: createIntegrationsModule(userClient),
    asServiceRole: {
      auth: wrappedAuth,
      entities: createEntitiesModule(serviceClient, callerRef),
      integrations: createIntegrationsModule(serviceClient),
    },
  };
}

export function createClientFromRequest(request) {
  return createClient({
    accessToken: bearerToken(request),
    appId:
      request?.headers?.get?.("x-app-id") ||
      request?.headers?.get?.("X-App-Id") ||
      null,
  });
}

export default { createClient, createClientFromRequest };
