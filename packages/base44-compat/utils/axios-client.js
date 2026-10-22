import { Base44Error } from "./errors.js";

/**
 * Drop-in replacement for @base44/sdk createAxiosClient.
 * AuthContext only uses it for public-settings bootstrap.
 */
export { Base44Error };

export function createAxiosClient({
  baseURL,
  headers = {},
  token,
  interceptResponses = true,
} = {}) {
  const client = {
    defaults: { headers: { common: {} } },
    async get(path) {
      // Compat: app no longer depends on Base44 public-settings API.
      if (String(path).includes("public-settings")) {
        const appId =
          headers["X-App-Id"] ||
          import.meta.env.VITE_BASE44_APP_ID ||
          "operapp";
        const payload = {
          id: appId,
          public_settings: {
            auth_required: true,
            app_name: "Operapp",
          },
        };
        return interceptResponses ? payload : { data: payload, status: 200 };
      }

      throw new Base44Error(
        `Unhandled GET ${baseURL || ""}${path}`,
        404,
        "NOT_FOUND",
        { message: "Not found" },
        null
      );
    },
    async post() {
      throw new Base44Error("Not implemented", 501, "NOT_IMPLEMENTED", null, null);
    },
  };

  if (token) {
    client.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  return client;
}
