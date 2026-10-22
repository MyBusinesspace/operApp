#!/usr/bin/env node
/**
 * Rebuild main as one clean commit (Aloosh only) and force-push,
 * so GitHub drops stale co-author contributor attributions.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "Aloosh",
  GIT_AUTHOR_EMAIL: "alialqasem@gmail.com",
  GIT_COMMITTER_NAME: "Aloosh",
  GIT_COMMITTER_EMAIL: "alialqasem@gmail.com",
};

function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: opts.stdio || ["ignore", "pipe", "pipe"],
    ...opts,
  }).trim();
}

const msg = [
  "Initial OperApp application snapshot on Supabase and Vercel.",
  "",
  "Includes the Base44 app sync, marketing landing, interactive demo, and repository git hooks.",
].join("\n");

const msgFile = path.join(root, ".git", "CLEAN_ROOT_MSG.txt");
fs.writeFileSync(msgFile, msg + "\n", "utf8");

console.log("Creating orphan branch…");
try {
  git(["checkout", "--orphan", "clean-main-rebuild"]);
} catch (e) {
  // already on orphan?
  console.log(String(e.stderr || e.message));
}

try {
  git(["rm", "-r", "--cached", ".cursor"]);
} catch {
  /* ok */
}

git(["add", "-A"]);
const tree = git(["write-tree"]);
console.log("tree", tree);

const commit = execFileSync("git", ["commit-tree", tree, "-F", msgFile], {
  cwd: root,
  env,
  encoding: "utf8",
}).trim();
console.log("commit", commit);

git(["reset", "--hard", commit]);
git(["branch", "-M", "main"]);

console.log(git(["log", "-1", "--format=%H%n%an <%ae>%n%cn <%ce>%n%s%n%b"]));

console.log("Force-pushing main…");
execFileSync("git", ["push", "--force", "origin", "main"], {
  cwd: root,
  env,
  stdio: "inherit",
});

fs.unlinkSync(msgFile);
console.log("DONE");
