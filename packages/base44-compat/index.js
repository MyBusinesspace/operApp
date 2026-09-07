/**
 * Operapp Base44 → Supabase compatibility SDK.
 *
 * KEEP THIS FOLDER when replacing Base44-exported pages/components.
 * Vite aliases `@base44/sdk` here — pages can stay Base44-shaped forever.
 */
export { createClient, createClientFromRequest } from "./client.js";
export { Base44Error, createAxiosClient } from "./utils/axios-client.js";
export {
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
} from "./utils/auth-utils.js";
