import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";

export const PAGES_BRANCH = "gh-pages";
const DIST_DIR = "web/dist";

function git(args: readonly string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export async function buildDashboard(): Promise<void> {
  await build({ configFile: "web/vite.config.ts", logLevel: "warn" });
}

// Replaces the gh-pages branch with a single commit holding the built dashboard, so data
// snapshots never accumulate in history.
export async function publishDashboard(log: (line: string) => void): Promise<string> {
  const remote = git(["remote", "get-url", "origin"], process.cwd());
  const author = git(["config", "user.name"], process.cwd());
  const email = git(["config", "user.email"], process.cwd());
  const dir = await mkdtemp(join(tmpdir(), "gridiron-pages-"));
  try {
    await cp(DIST_DIR, dir, { recursive: true });
    await writeFile(join(dir, ".nojekyll"), "");
    git(["init", "-q", "-b", PAGES_BRANCH], dir);
    git(["add", "-A"], dir);
    git(
      ["-c", `user.name=${author}`, "-c", `user.email=${email}`, "commit", "-q", "-m", `Publish dashboard ${new Date().toISOString()}`],
      dir,
    );
    git(["push", "-q", "--force", remote, PAGES_BRANCH], dir);
    log(`published ${DIST_DIR} to ${PAGES_BRANCH}`);
    return remote;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
