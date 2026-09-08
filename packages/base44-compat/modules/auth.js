import { getSupabase, getSupabaseConfig } from "../supabase.js";
import {
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
} from "../utils/auth-utils.js";
import { toBase44Error } from "../utils/errors.js";

function mapAuthUser(user, profile = {}) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const role = profile.role || meta.role || "office_staff";
  return {
    ...profile,
    id: user.id,
    email: user.email,
    full_name: profile.full_name ?? meta.full_name ?? meta.name ?? null,
    created_date: profile.created_date || user.created_at,
    updated_date: profile.updated_date || user.updated_at || user.created_at,
    disabled: false,
    is_verified: Boolean(user.email_confirmed_at),
    app_id: import.meta.env.VITE_BASE44_APP_ID || "operapp",
    is_service: false,
    _app_role: role,
    role,
  };
}

async function loadProfile(userId) {
  const supabase = getSupabase();
  const { data } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  return data || {};
}

async function countUsers(filter = {}) {
  const supabase = getSupabase();
  let q = supabase.from("users").select("id", { count: "exact", head: true });
  if (filter.role) q = q.eq("role", filter.role);
  const { count } = await q;
  return count ?? 0;
}

async function ensureBootstrapRoles() {
  const supabase = getSupabase();
  const { count } = await supabase
    .from("employee_role")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  const now = new Date().toISOString();
  const roles = [
    { name: "Admin", key: "admin", color: "#ef4444", is_system: true, sort_order: 0, description: "Full access" },
    { name: "Manager", key: "manager", color: "#6366f1", is_system: true, sort_order: 1 },
    { name: "Office Staff", key: "office_staff", color: "#0ea5e9", is_system: true, sort_order: 2 },
    { name: "Team Leader", key: "team_leader", color: "#22c55e", is_system: true, sort_order: 3 },
    { name: "Field Staff", key: "field_staff", color: "#f59e0b", is_system: true, sort_order: 4 },
  ].map((r) => ({
    id: crypto.randomUUID(),
    created_date: now,
    updated_date: now,
    ...r,
  }));

  await supabase.from("employee_role").insert(roles);
}

/**
 * Returns the Employee row for this auth user, linking or creating it as needed.
 * Linking by email first prevents duplicates when an admin pre-creates staff.
 */
async function ensureEmployeeLink(user, profile) {
  if (!user?.id) return null;
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from("employee")
    .select("*")
    .eq("user_id", user.id)
    .limit(1);
  if (existing?.length) return existing[0];

  if (user.email) {
    const { data: byEmail } = await supabase
      .from("employee")
      .select("*")
      .ilike("email", user.email)
      .limit(1);
    const candidate = byEmail?.[0];
    if (candidate && !candidate.user_id) {
      const { data: linked } = await supabase
        .from("employee")
        .update({
          user_id: user.id,
          user_email: user.email,
          updated_date: new Date().toISOString(),
        })
        .eq("id", candidate.id)
        .select("*")
        .maybeSingle();
      return linked || { ...candidate, user_id: user.id };
    }
    if (candidate) return candidate;
  }

  const meta = user.user_metadata || {};
  const fullName =
    profile.full_name || meta.full_name || meta.name || user.email?.split("@")[0] || "User";
  const roleLabel =
    profile.role === "admin"
      ? "Admin"
      : profile.role === "manager"
        ? "Manager"
        : profile.role === "office_staff"
          ? "Office Staff"
          : profile.role === "field_staff"
            ? "Field Staff"
            : "Admin";

  const now = new Date().toISOString();
  const { data: created } = await supabase
    .from("employee")
    .insert({
      id: crypto.randomUUID(),
      created_date: now,
      updated_date: now,
      created_by: user.email,
      created_by_id: user.id,
      full_name: fullName,
      email: user.email,
      role: roleLabel,
      status: "Active",
      user_id: user.id,
      user_email: user.email,
      department: "Management",
    })
    .select("*")
    .maybeSingle();
  return created || null;
}

/**
 * The app treats `user.role === "admin"` as full access, while HR assigns the
 * Employee "Admin" role. Bridge the two so admin staff really get admin rights.
 */
async function employeeRoleIsAdmin(employee) {
  if (!employee?.role) return false;
  const label = String(employee.role).trim().toLowerCase();
  if (label === "admin") return true;

  const supabase = getSupabase();
  const { data: roles } = await supabase.from("employee_role").select("name,key").limit(200);
  const match = (roles || []).find(
    (r) =>
      String(r.name || "").trim().toLowerCase() === label ||
      String(r.key || "").trim().toLowerCase() === label
  );
  return String(match?.key || "").trim().toLowerCase() === "admin";
}

/**
 * First local user (or any user when no admin exists yet) becomes platform admin.
 * Admins bypass RolePermission checks in the existing page hooks.
 */
async function ensureProfile(user, extras = {}) {
  if (!user) return {};
  const supabase = getSupabase();
  await ensureBootstrapRoles();

  const existing = await loadProfile(user.id);
  const adminCount = await countUsers({ role: "admin" });
  const totalUsers = await countUsers();
  const shouldBeAdmin = Boolean(extras.role === "admin" || adminCount === 0 || totalUsers === 0);

  if (existing?.id) {
    let profile = existing;
    const employee = await ensureEmployeeLink(user, profile);
    const promote = shouldBeAdmin || (await employeeRoleIsAdmin(employee));
    if (promote && existing.role !== "admin") {
      const { data } = await supabase
        .from("users")
        .update({ role: "admin", updated_date: new Date().toISOString() })
        .eq("id", user.id)
        .select("*")
        .maybeSingle();
      profile = data || { ...existing, role: "admin" };
    } else if (!promote && existing.role === "admin" && employee?.role) {
      // HR downgraded this person: stop granting the admin bypass.
      const { data } = await supabase
        .from("users")
        .update({ role: "office_staff", updated_date: new Date().toISOString() })
        .eq("id", user.id)
        .select("*")
        .maybeSingle();
      profile = data || { ...existing, role: "office_staff" };
    }
    return profile;
  }

  const meta = user.user_metadata || {};
  const row = {
    id: user.id,
    role: extras.role || (shouldBeAdmin ? "admin" : "office_staff"),
    created_date: new Date().toISOString(),
    updated_date: new Date().toISOString(),
    created_by: user.email,
    created_by_id: user.id,
    full_name: meta.full_name || meta.name || null,
    email: user.email,
    ...extras,
  };
  if (shouldBeAdmin) row.role = "admin";

  const { data } = await supabase.from("users").upsert(row).select("*").maybeSingle();
  let profile = data || row;
  const employee = await ensureEmployeeLink(user, profile);

  if (profile.role !== "admin" && (await employeeRoleIsAdmin(employee))) {
    const { data: promoted } = await supabase
      .from("users")
      .update({ role: "admin", updated_date: new Date().toISOString() })
      .eq("id", user.id)
      .select("*")
      .maybeSingle();
    profile = promoted || { ...profile, role: "admin" };
  }

  return profile;
}

async function syncTokenFromSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) saveAccessToken(token);
  return data?.session || null;
}

export function createAuthModule(options = {}) {
  const appBaseUrl = options.appBaseUrl || window.location.origin;

  return {
    async me() {
      const supabase = getSupabase();
      const result = await Promise.race([
        supabase.auth.getUser(),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                toBase44Error(
                  {
                    // Not 401/403: original AuthContext maps those to auth_required
                    // which calls redirectToLogin() during render and breaks /login.
                    message: "Authentication timeout",
                    status: 440,
                    code: "AUTH_TIMEOUT",
                    data: {},
                  },
                  440
                )
              ),
            8000
          )
        ),
      ]);
      const { data, error } = result;
      if (error || !data?.user) {
        removeAccessToken();
        throw toBase44Error(
          {
            message: "Not authenticated",
            status: 440,
            code: "NO_SESSION",
            data: {},
          },
          440
        );
      }
      const profile = await ensureProfile(data.user);
      return mapAuthUser(data.user, profile);
    },

    async updateMe(payload = {}) {
      const me = await this.me();
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("users")
        .update({ ...payload, updated_date: new Date().toISOString() })
        .eq("id", me.id)
        .select("*")
        .single();
      if (error) throw toBase44Error(error, 400);
      return mapAuthUser({ id: me.id, email: me.email, created_at: me.created_date }, data);
    },

    redirectToLogin(nextUrl = "/") {
      // Safety: never bounce auth pages (original App.jsx may call this during render).
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      if (
        path === "/login" ||
        path === "/register" ||
        path === "/forgot-password" ||
        path === "/reset-password"
      ) {
        return;
      }
      window.location.href = getLoginUrl(nextUrl);
    },
    loginWithProvider(provider, fromUrl = "/") {
      const supabase = getSupabase();
      const appOrigin =
        import.meta.env.VITE_APP_URL ||
        (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:5173");
      const redirectTo = new URL(fromUrl || "/", appOrigin).toString();

      supabase.auth
        .signInWithOAuth({
          provider,
          options: {
            redirectTo,
            queryParams:
              provider === "google"
                ? { access_type: "offline", prompt: "select_account" }
                : undefined,
          },
        })
        .then(({ data, error }) => {
          if (error) {
            console.error("OAuth error", error);
            window.alert(
              error.message?.includes("provider is not enabled")
                ? "Google login is not enabled yet. Fill supabase/.env with Google Client ID/Secret, set [auth.external.google] enabled = true, then run: npm run db:stop && npm run db:start"
                : error.message
            );
            return;
          }
          if (data?.url) window.location.href = data.url;
        });
    },

    async logout(redirectUrl) {
      try {
        const { configured } = getSupabaseConfig();
        if (configured) {
          const supabase = getSupabase();
          await supabase.auth.signOut();
        }
      } catch (e) {
        console.warn("logout error", e);
      }
      removeAccessToken();
      // AuthContext calls logout() with no args to clear token without navigation.
      if (typeof redirectUrl === "string" && redirectUrl.length) {
        window.location.href = redirectUrl;
      }
    },

    setToken(token, saveToStorage = true) {
      if (saveToStorage) saveAccessToken(token);
      // Best-effort: if token looks like a JWT, rely on supabase session store.
      // For email OTP flows that only give access_token, setSession may need refresh_token.
    },

    async loginViaEmailPassword(email, password) {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw toBase44Error(
          { message: error.message, status: 401, code: "INVALID_CREDENTIALS", data: error },
          401
        );
      }
      if (data.session?.access_token) saveAccessToken(data.session.access_token);
      const profile = await ensureProfile(data.user);
      return {
        access_token: data.session?.access_token,
        user: mapAuthUser(data.user, profile),
      };
    },

    async register({ email, password }) {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw toBase44Error(error, 400);
      // Supabase may require email confirmation (OTP / link). Mirror Base44 register response.
      return {
        status: data.session ? "authenticated" : "otp_required",
        user: data.user,
        session: data.session,
      };
    },

    async verifyOtp({ email, otpCode }) {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: "signup",
      });
      if (error) {
        // Try email change / magic link style as fallback
        const retry = await supabase.auth.verifyOtp({
          email,
          token: otpCode,
          type: "email",
        });
        if (retry.error) throw toBase44Error(error, 400);
        if (retry.data.session?.access_token) saveAccessToken(retry.data.session.access_token);
        const profile = await ensureProfile(retry.data.user);
        return {
          access_token: retry.data.session?.access_token,
          user: mapAuthUser(retry.data.user, profile),
        };
      }
      if (data.session?.access_token) saveAccessToken(data.session.access_token);
      const profile = await ensureProfile(data.user);
      return {
        access_token: data.session?.access_token,
        user: mapAuthUser(data.user, profile),
      };
    },

    async resendOtp({ email }) {
      const supabase = getSupabase();
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw toBase44Error(error, 400);
      return { success: true };
    },

    async isAuthenticated() {
      try {
        await this.me();
        return true;
      } catch {
        return false;
      }
    },

    async inviteUser(email, role = "user") {
      // Client-side invite is limited; prefer users.inviteUser / edge function.
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: { role },
          emailRedirectTo: `${appBaseUrl}/login`,
        },
      });
      if (error) throw toBase44Error(error, 400);
      return data;
    },

    async resetPasswordRequest(email) {
      const supabase = getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw toBase44Error(error, 400);
      return { success: true };
    },

    async resetPassword({ resetToken, newPassword }) {
      // Supabase recovery usually lands with a session already established via URL hash.
      const supabase = getSupabase();
      if (resetToken) {
        // If a recovery token was passed as query param, try verifyOtp recovery.
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: resetToken,
          type: "recovery",
        });
        if (verifyError) {
          // Fall through — session may already exist from redirect.
          console.warn("reset token verify:", verifyError.message);
        }
      }
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw toBase44Error(error, 400);
      await syncTokenFromSession();
      return data;
    },

    async changePassword({ currentPassword, newPassword }) {
      const me = await this.me();
      await this.loginViaEmailPassword(me.email, currentPassword);
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw toBase44Error(error, 400);
      return data;
    },
  };
}
