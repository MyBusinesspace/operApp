#!/usr/bin/env node
/**
 * Point this clone at repo-managed hooks under .githooks/
 * (blocks Cursor trailers / .cursor files from being committed).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = path.join(root, ".githooks");

if (!fs.existsSync(hooksDir)) {
  console.warn("install-git-hooks: missing .githooks/ — skipped");
  process.exit(0);
}

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    stdio: "ignore",
  });
} catch {
  process.exit(0);
}

execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root });

for (const name of ["pre-commit", "commit-msg"]) {
  const p = path.join(hooksDir, name);
  if (fs.existsSync(p)) {
    try {
      fs.chmodSync(p, 0o755);
    } catch {
      /* Windows may ignore chmod */
    }
  }
}

console.log("✓ git hooks installed (.githooks → core.hooksPath)");
