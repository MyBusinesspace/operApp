import { getServiceClient, entityToTable } from "./supabase.js";

/**
 * Resolves the caller from a Supabase access token and returns a Base44-shaped
 * user (auth identity merged with the `users` profile row).
 */
export async function resolveUser(accessToken) {
  if (!accessToken) return null;

  const service = getServiceClient();
  const { data, error } = await service.auth.getUser(accessToken);
  const authUser = data?.user;
  if (error || !authUser) return null;

  const { data: profile } = await service
    .from(entityToTable("User"))
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  const metadata = authUser.user_metadata || {};
  return {
    ...(profile || {}),
    id: authUser.id,
    email: profile?.email || authUser.email || "",
    full_name: profile?.full_name || metadata.full_name || metadata.name || "",
    role: profile?.role || "user",
  };
}

export function createAuthModule(getAccessToken) {
  return {
    async me() {
      const user = await resolveUser(getAccessToken());
      if (!user) {
        const err = new Error("Unauthorized");
        err.status = 401;
        throw err;
      }
      return user;
    },

    async isAuthenticated() {
      return Boolean(await resolveUser(getAccessToken()));
    },
  };
}
