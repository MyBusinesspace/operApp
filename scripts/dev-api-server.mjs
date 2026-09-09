/**
 * Runs the Base44-compatible API locally, the same code Vercel serves from
 * api/[...path].js — so the mobile app can be pointed at this machine:
 *
 *   npm run api:dev
 *   flutter run --dart-define=BACKEND=vercel \
 *               --dart-define=VERCEL_SERVER_URL=http://10.0.2.2:3000
 *
 * Reads .env.local, then fills in any missing Supabase values from the running
 * local stack (`supabase status -o env`).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3000);

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith("#")) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

function loadLocalSupabaseKeys() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const values = Object.fromEntries(
      output
        .split(/\r?\n/)
        .map((line) => /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim()))
        .filter(Boolean)
        .map((match) => [match[1], match[2]])
    );
    process.env.SUPABASE_URL ||= values.API_URL || "";
    process.env.SUPABASE_ANON_KEY ||= values.ANON_KEY || "";
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= values.SERVICE_ROLE_KEY || "";
  } catch {
    console.warn("Could not read `supabase status` — relying on .env.local values.");
  }
}

loadEnvFile(path.join(root, ".env.local"));
process.env.SUPABASE_URL ||= process.env.VITE_SUPABASE_URL || "";
process.env.SUPABASE_ANON_KEY ||= process.env.VITE_SUPABASE_ANON_KEY || "";
loadLocalSupabaseKeys();
process.env.APP_URL ||= `http://localhost:${port}`;
process.env.API_KEY ||= "ee5f1c81442c47568b95570e76b54da5";
process.env.OTP_SECRET ||= "local-development-secret";

const generated = path.join(root, "packages", "base44-server", "generated", "index.js");
if (!fs.existsSync(generated)) {
  console.error("Missing compiled functions. Run: npm run api:build");
  process.exit(1);
}

const { routeApiRequest } = await import("../packages/base44-server/runtime.js");
const { toWebRequest, sendWebResponse } = await import(
  "../packages/base44-server/node-adapter.js"
);

http
  .createServer(async (req, res) => {
    const started = Date.now();
    try {
      const response = await routeApiRequest(await toWebRequest(req));
      if (!response) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: `No route for ${req.url}` }));
      } else {
        await sendWebResponse(res, response);
      }
    } catch (error) {
      console.error(error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: error?.message || "Internal error" }));
    }
    console.log(`${res.statusCode} ${req.method} ${req.url} (${Date.now() - started}ms)`);
  })
  .listen(port, () => {
    console.log(`Base44-compatible API on http://localhost:${port}`);
    console.log(`Supabase: ${process.env.SUPABASE_URL}`);
  });
