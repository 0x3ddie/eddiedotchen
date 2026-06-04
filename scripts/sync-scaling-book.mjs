// Syncs Scaling Book chapters from the public notes repo into the website.
//
// Source: https://github.com/0x3ddie/notes  (path: One/Scaling Book/*.md)
// Target: content/writing/scaling-book/<slug>.mdx + index.json
//
// Only files with `published: true` in their frontmatter are written.
// All output paths are gitignored — the source of truth is the notes repo.
//
// Runs as part of `npm run generate` (so on every Vercel build), and can
// also be invoked directly: `npm run sync:scaling-book`.

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import matter from "gray-matter";

const NOTES_REPO = "https://github.com/0x3ddie/notes.git";
const NOTES_PATH = "One/Scaling Book";
const OUT_DIR = path.join(process.cwd(), "content", "writing", "scaling-book");

function slugify(filename) {
  return filename
    .replace(/\.md$/, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function log(line) {
  console.log(`[sync:scaling-book] ${line}`);
}

async function main() {
  const tmp = mkdtempSync(path.join(tmpdir(), "scaling-book-sync-"));
  log(`cloning ${NOTES_REPO} (shallow) → ${tmp}`);

  try {
    execSync(`git clone --depth=1 --quiet "${NOTES_REPO}" "${tmp}"`, {
      stdio: "inherit",
      timeout: 60_000,
    });
  } catch (err) {
    log(`clone failed: ${err.message}`);
    log("continuing without scaling-book content (non-fatal).");
    rmSync(tmp, { recursive: true, force: true });
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, "index.json"), "[]");
    return;
  }

  const sourceDir = path.join(tmp, NOTES_PATH);
  if (!existsSync(sourceDir)) {
    log(`source path does not exist in clone: ${NOTES_PATH}`);
    rmSync(tmp, { recursive: true, force: true });
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, "index.json"), "[]");
    return;
  }

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  } else {
    // Wipe stale chapters so deletes/unpublish-flips in the source repo propagate.
    for (const f of readdirSync(OUT_DIR)) {
      if (f.endsWith(".mdx") || f === "index.json") {
        rmSync(path.join(OUT_DIR, f));
      }
    }
  }

  const mdFiles = readdirSync(sourceDir).filter((f) => f.endsWith(".md"));
  const manifest = [];

  for (const filename of mdFiles) {
    const fullPath = path.join(sourceDir, filename);
    const raw = readFileSync(fullPath, "utf8");
    if (raw.trim().length === 0) {
      log(`skip "${filename}": empty file`);
      continue;
    }

    const { data: frontmatter, content } = matter(raw);
    if (frontmatter.published !== true) {
      log(`skip "${filename}": no \`published: true\` in frontmatter`);
      continue;
    }

    const slug = slugify(filename);
    const title = frontmatter.title || filename.replace(/\.md$/, "");
    const description = frontmatter.description || "";
    const date = frontmatter.date || "";
    const order =
      typeof frontmatter.order === "number"
        ? frontmatter.order
        : parseChapterNumber(filename) ?? 999;

    // Re-emit with normalized frontmatter so the page renderer can rely on it.
    const fm = [
      "---",
      `title: ${JSON.stringify(title)}`,
      `description: ${JSON.stringify(description)}`,
      `date: ${JSON.stringify(date)}`,
      `slug: ${JSON.stringify(slug)}`,
      `order: ${order}`,
      "---",
      "",
    ].join("\n");

    const outPath = path.join(OUT_DIR, `${slug}.mdx`);
    writeFileSync(outPath, fm + content);

    manifest.push({ slug, title, description, date, order });
    log(`wrote "${slug}.mdx" (${content.length} bytes)`);
  }

  manifest.sort((a, b) => a.order - b.order);
  writeFileSync(
    path.join(OUT_DIR, "index.json"),
    JSON.stringify(manifest, null, 2)
  );

  log(`manifest: ${manifest.length} published chapter(s)`);

  rmSync(tmp, { recursive: true, force: true });
}

function parseChapterNumber(filename) {
  // "Chapter 1.md" -> 1, "Chapter 12.md" -> 12. Returns null if no number.
  const m = filename.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

main().catch((err) => {
  console.error(`[sync:scaling-book] FATAL: ${err.message}`);
  process.exit(1);
});
