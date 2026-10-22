#!/usr/bin/env node
/**
 * Restore OperApp marketing landing + demo after a Base44 src/ replace.
 * Safe path: ops/landing-backup/  (outside src/ and base44/)
 *
 * Usage (repo root): node ops/landing-backup/restore.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const backup = __dirname;

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

function copy(fromRel, toRel) {
  const from = path.join(backup, fromRel);
  const to = path.join(root, toRel);
  if (!fs.existsSync(from)) throw new Error(`Missing backup file: ${from}`);
  write(to, read(from));
  console.log(`✓ copied ${toRel}`);
}

function patchFile(rel, mutator) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.warn(`⚠ skip missing ${rel}`);
    return;
  }
  const before = read(full);
  const after = mutator(before);
  if (after === before) {
    console.log(`· unchanged ${rel}`);
    return;
  }
  write(full, after);
  console.log(`✓ patched ${rel}`);
}

// 1) Landing page sources
copy("pages/LandingPage.jsx", "src/pages/LandingPage.jsx");
copy("pages/LandingPage.css", "src/pages/LandingPage.css");

// 1b) Login cinematic shell (survives Base44 Login.jsx replaces)
if (fs.existsSync(path.join(backup, "pages/Login.css"))) {
  copy("pages/Login.css", "src/pages/Login.css");
}
if (fs.existsSync(path.join(backup, "patches/Login.jsx"))) {
  copy("patches/Login.jsx", "src/pages/Login.jsx");
}

// 2) App.jsx — prefer full known-good patch (public /, /app, demo, PUBLIC_PATHS)
const appPatch = path.join(backup, "patches/App.jsx");
const appTarget = path.join(root, "src/App.jsx");
if (fs.existsSync(appPatch)) {
  // Merge: keep any NEW page imports/routes from fresh Base44 App that the patch lacks.
  const fresh = fs.existsSync(appTarget) ? read(appTarget) : "";
  let patched = read(appPatch);

  const freshImports = [...fresh.matchAll(/^import (\w+) from ('[^']+'|"[^"]+");?$/gm)];
  const patchImportNames = new Set(
    [...patched.matchAll(/^import (\w+) from/gm)].map((m) => m[1])
  );

  const missingImports = [];
  for (const m of freshImports) {
    const name = m[1];
    const from = m[2];
    if (patchImportNames.has(name)) continue;
    // Only auto-merge page/component routes — skip router/auth plumbing
    if (
      from.includes("@/pages/") ||
      from.includes("@/components/") ||
      from.includes("./")
    ) {
      if (
        [
          "LandingPage",
          "DemoSelect",
          "DemoDashboard",
          "Login",
          "Register",
          "ForgotPassword",
          "ResetPassword",
          "AppLayout",
          "ProtectedRoute",
          "UserNotRegisteredError",
          "PageNotFound",
        ].includes(name)
      ) {
        continue;
      }
      missingImports.push(m[0]);
    }
  }

  if (missingImports.length) {
    patched = patched.replace(
      /import \{ isDemoEnabled \} from '@demo\/index\.js';/,
      `import { isDemoEnabled } from '@demo/index.js';\n${missingImports.join("\n")}`
    );
    console.log(`· merged ${missingImports.length} new import(s) into App.jsx`);
  }

  // Merge fresh protected routes that the patch doesn't list (path="/something")
  const patchPaths = new Set(
    [...patched.matchAll(/path=["']([^"']+)["']/g)].map((m) => m[1])
  );
  const freshRoutes = [
    ...fresh.matchAll(/<Route\s+path=["']([^"']+)["']\s+element=\{<(\w+)\s*\/>\}\s*\/>/g),
  ];
  const extraRoutes = [];
  for (const m of freshRoutes) {
    const routePath = m[1];
    const el = m[2];
    if (patchPaths.has(routePath)) continue;
    if (["/", "/login", "/register", "/forgot-password", "/reset-password", "/demo", "/demo/app", "*"].includes(routePath)) {
      continue;
    }
    if (routePath === "/app") continue;
    extraRoutes.push(`          <Route path="${routePath}" element={<${el} />} />`);
  }
  if (extraRoutes.length) {
    patched = patched.replace(
      /(<Route path="\/app" element=\{<Dashboard \/>\} \/>)/,
      `$1\n${extraRoutes.join("\n")}`
    );
    console.log(`· merged ${extraRoutes.length} new route(s) into App.jsx`);
  }

  write(appTarget, patched);
  console.log(`✓ wrote src/App.jsx from patches/App.jsx`);
} else {
  console.warn("⚠ missing patches/App.jsx — falling back to regex patch");
}

// 3) Login / Register → /app after auth
for (const rel of ["src/pages/Login.jsx", "src/pages/Register.jsx"]) {
  patchFile(rel, (src) => {
    let out = src;
    out = out.replace(
      /window\.location\.href\s*=\s*["']\/["']/g,
      'window.location.href = "/app"'
    );
    out = out.replace(
      /loginWithProvider\(\s*["']google["']\s*,\s*["']\/["']\s*\)/g,
      'loginWithProvider("google", "/app")'
    );
    out = out.replace(/Navigate to=["']\/["']/g, 'Navigate to="/app"');
    return out;
  });
}

// 4) TopNavBar logo → /app
patchFile("src/components/layout/TopNavBar.jsx", (src) => {
  let out = src;
  out = out.replace(
    /(<Link\s+to=["'])\/(["'][^>]*>[\s\S]{0,120}?operapp|OPERAPP|OperApp)/i,
    "$1/app$2"
  );
  if (!out.includes('to="/app"')) {
    out = out.replace(
      /to=["']\/["'](\s+className=["'][^"']*shrink-0)/,
      'to="/app"$1'
    );
  }
  return out;
});

console.log("\nLanding restore finished.");
console.log("Verify: open / for landing, /app for dashboard, /demo for demo, /login for auth.");
