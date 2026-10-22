/**
 * Enables Google OAuth in supabase/config.toml when credentials exist in supabase/.env
 * Usage: node scripts/enable-google-auth.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, "supabase", ".env");
const configFile = path.join(root, "supabase", "config.toml");

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

const env = loadEnv(envFile);
const id = env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID || "";
const secret = env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET || "";

if (!id || !secret) {
  console.error("Missing Google credentials in supabase/.env");
  console.error("Set SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID and SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET");
  console.error("Then re-run this script, then: npm run db:stop && npm run db:start");
  process.exit(1);
}

let toml = fs.readFileSync(configFile, "utf8");
toml = toml.replace(
  /(\[auth\.external\.google\][\s\S]*?enabled\s*=\s*)(true|false)/,
  `$1true`
);
fs.writeFileSync(configFile, toml, "utf8");
console.log("Enabled [auth.external.google] in config.toml");
console.log("Restart local stack: npm run db:stop && npm run db:start && npm run env:sync");
console.log("Google Console redirect URI must be exactly:");
console.log("  http://127.0.0.1:54321/auth/v1/callback");
