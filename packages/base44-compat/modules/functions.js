import { getSupabase } from "../supabase.js";
import { toBase44Error } from "../utils/errors.js";

/**
 * Maps base44.functions.invoke(name, payload) → supabase.functions.invoke(name, { body })
 * Returns { data } to match existing page call sites (res.data).
 */
export function createFunctionsModule() {
  return {
    async invoke(functionName, payload = {}) {
      if (typeof payload === "string") {
        throw new Error(
          `Function ${functionName} must receive an object with named parameters, received: ${payload}`
        );
      }

      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: payload instanceof FormData ? payload : payload || {},
      });

      if (error) {
        throw toBase44Error(
          {
            message: error.message || `Function ${functionName} failed`,
            status: 400,
            code: "FUNCTION_ERROR",
            data: error,
          },
          400
        );
      }

      // Pages use `res.data` — wrap if edge function returned the payload directly.
      if (data && typeof data === "object" && "data" in data) {
        return data;
      }
      return { data };
    },

    async fetch(path, init = {}) {
      const supabase = getSupabase();
      const name = String(path).replace(/^\//, "").split("/")[0];
      const { data, error } = await supabase.functions.invoke(name, {
        body: init.body ? JSON.parse(init.body) : {},
        headers: init.headers,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      }
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
}
