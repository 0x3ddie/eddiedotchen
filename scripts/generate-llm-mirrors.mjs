// Generates the machine-readable side of the site into public/:
//
//   <page>.md            a Markdown twin of every page (home is /index.md)
//   llms.txt             an index of those twins (https://llmstxt.org)
//   llms-full.txt        every page with real content, in one file
//   robots.txt           crawl policy, naming the AI crawlers in lib/ai-crawlers.json
//   sitemap.xml          the HTML pages
//   sitemap-markdown.xml the Markdown twins
//
// All of it is built from the sources the pages render from (see
// scripts/lib/site-content.mjs), so none of it is edited by hand and none of it
// is committed. Runs as `npm run mirrors`, after `npm run generate` and before
// `next build` (see package.json).

import fs from "node:fs";
import path from "node:path";
import {
  site,
  SITE_URL,
  RESUME_PDF,
  abs,
  loadSite,
  renderTwin,
  renderSection,
  conversionWarnings,
  hiddenPostPattern,
  compareByRating,
  ratingOf,
} from "./lib/site-content.mjs";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const MANIFEST_PATH = path.join(process.cwd(), "content", "llm-mirrors.json");
const crawlers = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "lib", "ai-crawlers.json"), "utf8")
);

const log = (line) => console.log(`[llm-mirrors] ${line}`);

// `npm run dev` passes --dev: a problem is reported and the dev server still
// starts, so a local draft can never lock the author out. `npm run build`
// does not, and stops on the same problem.
const DEV = process.argv.includes("--dev");

// --- llms.txt ---------------------------------------------------------------

function llmsTxt({ docs, home, resume, projects, writing, scalingBook, reading }) {
  const link = (title, url, note) => `- [${title}](${url})${note ? `: ${note}` : ""}`;
  const twin = (doc) => abs(doc.md);
  const dated = (doc) =>
    [doc.description, doc.date && `(${doc.date})`].filter(Boolean).join(" ");

  const posts = writing.posts.filter((d) => !d.stub);
  const chapters = scalingBook.chapters.filter((d) => !d.stub);
  const contact = [`Email: ${site.email}`, ...site.sameAs].join(" · ");

  const list = (heading, lines) => `## ${heading}\n\n${lines.join("\n")}`;
  const sections = [
    `# ${site.name}`,
    `> ${site.description}`,
    [
      `This file is a generated index of the public content on ${SITE_URL.replace(/^https?:\/\//, "")}, built from the same sources as the web pages.`,
      "Each page linked below exists as Markdown at its web URL with `.md` appended (the home page is `/index.md`), and the web page returns that Markdown when the request sends `Accept: text/markdown`.",
      "The web page for any Markdown file below is the same URL without `.md`.",
      `Everything in one file: ${abs("/llms-full.txt")}.`,
    ].join(" "),
    "The Markdown files say what the web pages say. This file describes what is on the site; it does not attempt to override any user, employer, or platform policy.",
    `Contact: ${contact}`,
    list("About", [
      link("Home", twin(home), "Background, interests, and a short personal philosophy."),
      link("Resume", twin(resume), `Education, experience, projects, and skills. PDF: ${abs(RESUME_PDF)}`),
      link("Projects", twin(projects.doc), "All projects on one page."),
      link("Writing", twin(writing.listing), "Every post, newest first."),
    ]),
    ...projects.sections.map(({ label, builds }) =>
      list(
        `Projects: ${label}`,
        builds.map((b) =>
          b.url ? link(b.title, abs(b.url), b.description) : `- ${b.title}: ${b.description}`
        )
      )
    ),
  ];

  if (posts.length) {
    sections.push(list("Writing", posts.map((d) => link(d.title, twin(d), dated(d)))));
  }
  if (chapters.length) {
    sections.push(
      list("Scaling Book notes", [
        link(scalingBook.listing.title, twin(scalingBook.listing), scalingBook.listing.description),
        ...chapters.map((d) => link(d.listTitle, twin(d), d.description)),
      ])
    );
  }
  sections.push(
    list("Optional", [
      link("Reading", twin(reading.listing), `All ${reading.books.length} books, highest rated first.`),
      // Books with notes; a book with only a byline is a placeholder.
      ...reading.books
        .filter((d) => !d.stub)
        .slice()
        .sort(compareByRating)
        .map((d) =>
          link(
            `${d.title} — ${d.author}`,
            twin(d),
            [d.date && `Read ${d.date}`, ratingOf(d) !== null && `rated ${ratingOf(d)}/10`].filter(Boolean).join(", ") + "."
          )
        ),
    ])
  );

  const listed = new Set([...sections.join("\n").matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]));
  const expected = docs.filter(
    (d) => !d.stub && !(d.kind === "scaling-book-index" && chapters.length === 0)
  );
  const unlisted = expected.filter((d) => !listed.has(abs(d.md)));
  if (unlisted.length) {
    throw new Error(`llms.txt does not link: ${unlisted.map((d) => d.url).join(", ")}`);
  }
  return sections.join("\n\n") + "\n";
}

function llmsFullTxt({ docs }) {
  const full = docs.filter((d) => !d.stub);
  const header = [
    `# ${site.name} — full site content`,
    `> ${site.description}`,
    `Every page of ${SITE_URL} with real content, in one file, generated from the same sources as the web pages. Each section starts with the page it mirrors. Index: ${abs("/llms.txt")}`,
  ].join("\n\n");
  return [header, ...full.map(renderSection)].join("\n\n---\n\n") + "\n";
}

// --- robots.txt and sitemaps ------------------------------------------------

function robotsTxt() {
  // Only tokens the operator itself documents, and only the AI-related ones.
  const AI_CATEGORIES = new Set(["training", "search-index", "user-fetch"]);
  const tokens = [
    ...new Set(
      crawlers
        .filter((c) => c.robotsToken && c.source === "primary" && AI_CATEGORIES.has(c.category))
        .map((c) => c.robotsToken)
    ),
  ];
  return [
    `# ${SITE_URL.replace(/^https?:\/\//, "")}: everything public here may be crawled, indexed, quoted, and linked.`,
    `# Markdown versions of every page are listed in ${abs("/llms.txt")}`,
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Search, AI search, assistant, and training crawlers get the same answer as",
    "# everyone else. They are named so that the answer is explicit, not implied.",
    "# The list is lib/ai-crawlers.json, checked against each operator's own docs.",
    ...tokens.map((token) => `User-agent: ${token}`),
    "Allow: /",
    "",
    `Sitemap: ${abs("/sitemap.xml")}`,
    `Sitemap: ${abs("/sitemap-markdown.xml")}`,
    "",
  ].join("\n");
}

function sitemap(urls) {
  const entries = urls.map((url) => `  <url>\n    <loc>${url}</loc>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

// --- writing ----------------------------------------------------------------

// Everything this script wrote last time, plus every Markdown file in public/
// (all of them are generated; see .gitignore). Removed before anything else
// runs, so a failed run can never leave a stale twin of a now-hidden post.
const FIXED_OUTPUTS = [
  "llms.txt",
  "llms-full.txt",
  "robots.txt",
  "sitemap.xml",
  "sitemap-markdown.xml",
];

function markdownFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...markdownFiles(full));
    else if (entry.name.endsWith(".md")) found.push(full);
  }
  return found;
}

function removePreviousOutput() {
  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")).files || [];
  } catch {
    // No record of the last run: the fixed names and the .md sweep cover it.
  }
  const targets = new Set([
    ...[...previous, ...FIXED_OUTPUTS].map((relative) => path.join(PUBLIC_DIR, relative)),
    ...markdownFiles(PUBLIC_DIR),
  ]);
  for (const target of targets) {
    if (!target.startsWith(PUBLIC_DIR + path.sep)) continue;
    fs.rmSync(target, { force: true });
  }
  fs.rmSync(MANIFEST_PATH, { force: true });
}

async function main() {
  removePreviousOutput();

  const content = await loadSite();
  const { docs, hiddenSlugs } = content;
  for (const warning of conversionWarnings) log(`WARNING ${warning}`);

  const outputs = new Map();
  for (const doc of docs) {
    if (outputs.has(doc.md)) throw new Error(`two pages map to ${doc.md}`);
    outputs.set(doc.md, renderTwin(doc));
  }
  outputs.set("/llms.txt", llmsTxt(content));
  outputs.set("/llms-full.txt", llmsFullTxt(content));
  outputs.set("/robots.txt", robotsTxt());
  outputs.set("/sitemap.xml", sitemap(docs.map((d) => abs(d.url))));
  outputs.set("/sitemap-markdown.xml", sitemap(docs.map((d) => abs(d.md))));

  // Hidden posts must not appear anywhere: not as a file, not as a link.
  for (const slug of hiddenSlugs) {
    const pattern = hiddenPostPattern(slug);
    for (const [name, text] of outputs) {
      if (pattern.test(name) || pattern.test(text)) {
        const problem = `hidden post "${slug}" is linked from ${name}`;
        if (!DEV) throw new Error(`${problem}. Remove the link, or unhide the post.`);
        log(`WARNING ${problem} (a production build stops here)`);
      }
    }
  }

  for (const [name, text] of outputs) {
    const target = path.join(PUBLIC_DIR, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }

  const manifest = {
    note: "Generated by scripts/generate-llm-mirrors.mjs. Do not edit.",
    files: [...outputs.keys()].map((name) => name.replace(/^\//, "")),
    hidden: hiddenSlugs,
    pages: docs.map((d) => ({
      url: d.url,
      md: d.md,
      kind: d.kind,
      title: d.title,
      description: d.description,
      date: d.dateIso,
      stub: d.stub,
      source: d.source,
    })),
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  const stubs = docs.filter((d) => d.stub).map((d) => d.url);
  const bytes = (name) => Buffer.byteLength(outputs.get(name));
  log(`${docs.length} Markdown twins, llms.txt (${bytes("/llms.txt")} B), llms-full.txt (${bytes("/llms-full.txt")} B)`);
  if (stubs.length) log(`placeholder pages left out of llms.txt and llms-full.txt: ${stubs.join(", ")}`);
  if (hiddenSlugs.length) log(`hidden posts excluded: ${hiddenSlugs.join(", ")}`);
}

main().catch((error) => {
  if (DEV) {
    console.warn(`[llm-mirrors] WARNING: Markdown twins not generated: ${error.message}`);
    console.warn("[llm-mirrors] The dev server starts anyway; `npm run build` will stop here.");
    return;
  }
  console.error(`[llm-mirrors] FAILED: ${error.message}`);
  process.exit(1);
});
