/**
 * Demo layer — lives outside src/ so Base44 replaces do not wipe it.
 * Mounted via Vite alias `@demo` → ops/demo
 */

export function isDemoEnabled() {
  // Local: always on. Production: only when VITE_ENABLE_DEMO=true.
  if (import.meta.env.DEV) return true;
  return import.meta.env.VITE_ENABLE_DEMO === "true";
}

export { INDUSTRIES, getIndustry } from "./industries.js";
export { loadFixture, cloneFixture } from "./fixtures/index.js";
export {
  getDemoIndustryId,
  setDemoIndustryId,
  clearDemoSession,
} from "./session.js";
