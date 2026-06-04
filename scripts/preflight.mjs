// Pre-flight check: aborts cleanly if free disk space is critically low.
// Runs automatically before `npm run dev` and `npm run build` via the
// `predev` / `prebuild` lifecycle scripts.
//
// Why this exists: when the disk fills up while git or Node is writing
// to .git/objects/ or node_modules/, partial writes corrupt those stores
// permanently. We caught this twice in production (bus errors, missing
// git objects, ETIMEDOUT on readFileSync). Cheaper to fail loud here.

import { statfs } from "node:fs/promises";

const HARD_LIMIT_GIB = 3;
const SOFT_LIMIT_GIB = 20;
const CHECK_PATH = "/";

if (process.env.CI || process.env.VERCEL || process.env.SKIP_PREFLIGHT) {
  process.exit(0);
}

try {
  const stats = await statfs(CHECK_PATH);
  const availGiB = (stats.bsize * stats.bavail) / 1024 ** 3;

  if (availGiB < HARD_LIMIT_GIB) {
    console.error(
      `\n  ERROR: only ${availGiB.toFixed(1)} GiB free on ${CHECK_PATH}.`
    );
    console.error(
      `  Below ${HARD_LIMIT_GIB} GiB, write failures can corrupt node_modules / .git`
    );
    console.error(`  (we have hit this before). Free up disk first.\n`);
    console.error(`  To bypass for one run: SKIP_PREFLIGHT=1 npm run dev\n`);
    process.exit(1);
  }

  if (availGiB < SOFT_LIMIT_GIB) {
    console.warn(
      `\n  WARNING: only ${availGiB.toFixed(1)} GiB free on ${CHECK_PATH}.`
    );
    console.warn(
      `  Recommended at least ${SOFT_LIMIT_GIB} GiB to avoid intermittent issues.\n`
    );
  }
} catch (err) {
  // Don't block builds on a preflight bug. Log and continue.
  console.warn(`  preflight: skipping disk check (${err.message})`);
}
