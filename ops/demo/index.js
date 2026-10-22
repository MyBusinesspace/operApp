/**
 * Demo layer — lives outside src/ so Base44 replaces do not wipe it.
 * Mounted via Vite alias `@demo` → ops/demo
 */

export function isDemoEnabled() {
  // On unless explicitly disabled (local + Vercel production).
  return import.meta.env.VITE_ENABLE_DEMO !== "false";
}

export { INDUSTRIES, getIndustry } from "./industries.js";
export { loadFixture, cloneFixture } from "./fixtures/index.js";
export {
  getDemoIndustryId,
  setDemoIndustryId,
  clearDemoSession,
} from "./session.js";
