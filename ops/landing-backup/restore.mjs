#!/usr/bin/env node
/**
 * Restore OperApp marketing landing after a Base44 src/ replace.
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

// 2) App.jsx — import + public / + protected /app
patchFile("src/App.jsx", (src) => {
  let out = src;

  if (!out.includes("LandingPage")) {
    if (out.includes("import Dashboard")) {
      out = out.replace(
        /import Dashboard from ['"]@\/pages\/Dashboard['"];?/,
        (m) => `${m}\nimport LandingPage from '@/pages/LandingPage';`
      );
    } else {
      out = `import LandingPage from '@/pages/LandingPage';\n` + out;
    }
  }

  // Prefer public landing at /
  out = out.replace(
    /<Route\s+path=["']\/["']\s+element=\{<Dashboard\s*\/?>\}\s*\/>/,
    '<Route path="/" element={<LandingPage />} />'
  );

  // If / still points at something else that isn't LandingPage, force it
  if (!/path=["']\/["'][^>]*LandingPage/.test(out)) {
    // Insert public landing route before protected block when possible
    if (out.includes("<Routes>")) {
      out = out.replace(
        /<Routes>/,
        `<Routes>\n      <Route path="/" element={<LandingPage />} />`
      );
    }
  }

  // Ensure /app → Dashboard exists
  if (!/path=["']\/app["']/.test(out)) {
    if (/path=["']\/contacts["']/.test(out)) {
      out = out.replace(
        /<Route\s+path=["']\/contacts["']/,
        '<Route path="/app" element={<Dashboard />} />\n          <Route path="/contacts"'
      );
    } else if (out.includes("<AppLayout")) {
      out = out.replace(
        /(<Route\s+element=\{<AppLayout\s*\/>\}>\s*)/,
        `$1\n          <Route path="/app" element={<Dashboard />} />\n          `
      );
    } else {
      out = out.replace(
        /<\/Routes>/,
        `      <Route path="/app" element={<Dashboard />} />\n    </Routes>`
      );
    }
  }

  // Unauthenticated users should hit /login (not /) when protecting the app
  out = out.replace(
    /unauthenticatedElement=\{<Navigate to=["']\/["'] replace \/>\}/g,
    `unauthenticatedElement={<Navigate to="/login" replace />}`
  );

  // Demo routes (ops/demo stays intact; only re-wire App.jsx)
  if (!out.includes("@demo/pages/DemoSelect")) {
    out = out.replace(
      /import LandingPage from ['"]@\/pages\/LandingPage['"];?/,
      `import LandingPage from '@/pages/LandingPage';\nimport DemoSelect from '@demo/pages/DemoSelect.jsx';\nimport DemoDashboard from '@demo/pages/DemoDashboard.jsx';\nimport { isDemoEnabled } from '@demo/index.js';`
    );
  }
  if (!out.includes('path="/demo"') && out.includes("<LandingPage")) {
    out = out.replace(
      /<Route path=["']\/reset-password["'][^/]*\/>/,
      (m) =>
        `${m}\n      {isDemoEnabled() && (\n        <>\n          <Route path="/demo" element={<DemoSelect />} />\n          <Route path="/demo/app" element={<DemoDashboard />} />\n        </>\n      )}`
    );
  }
  if (!out.includes('pathname.startsWith("/demo")')) {
    out = out.replace(
      /const isPublicPath = PUBLIC_PATHS\.has\(pathname\);/,
      `const isPublicPath =\n    PUBLIC_PATHS.has(pathname) || pathname.startsWith("/demo");`
    );
  }
  for (const p of ["/demo", "/demo/app"]) {
    if (!out.includes(`"${p}"`) && out.includes("PUBLIC_PATHS")) {
      out = out.replace(
        /\/reset-password["'],?\s*\n\s*\];/,
        `/reset-password",\n  "/demo",\n  "/demo/app",\n];`
      );
      break;
    }
  }

  return out;
});

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
    out = out.replace(
      /Navigate to=["']\/["']/g,
      'Navigate to="/app"'
    );
    return out;
  });
}

// 4) TopNavBar logo → /app
patchFile("src/components/layout/TopNavBar.jsx", (src) => {
  let out = src;
  // Common patterns: logo Link to="/"
  out = out.replace(
    /(<Link\s+to=["'])\/(["'][^>]*>[\s\S]{0,120}?operapp|OPERAPP|OperApp)/i,
    "$1/app$2"
  );
  // Simpler: first brand link in header area often to="/"
  if (!out.includes('to="/app"')) {
    out = out.replace(
      /to=["']\/["'](\s+className=["'][^"']*shrink-0)/,
      'to="/app"$1'
    );
  }
  return out;
});

console.log("\nLanding restore finished.");
console.log("Verify: open / for landing, /app for dashboard, /login for auth.");
