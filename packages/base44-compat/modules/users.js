import { getSupabase } from "../supabase.js";
import { toBase44Error } from "../utils/errors.js";

export function createUsersModule() {
  return {
    /**
     * Invite a user by email. Uses magic-link OTP (creates auth user if needed).
     * Role is stored in user metadata / users table via ensure on first login.
     */
    async inviteUser(email, role = "user") {
      const supabase = getSupabase();

      // Prefer dedicated edge function when available (service role invite).
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, role },
      });

      if (!error && data) return data;

      // Fallback: client-side magic link (limited; may be rate-limited).
      const { data: otpData, error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: { role, invited: true },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (otpError) {
        throw toBase44Error(otpError || error, 400);
      }
      return otpData;
    },
  };
}
