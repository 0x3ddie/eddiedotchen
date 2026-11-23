// Loads every public page of the site as a Markdown document, from the same
// sources the pages render from. generate-llm-mirrors.mjs writes these out as
// the `.md` twins, llms.txt and llms-full.txt; verify-llm-mirrors.mjs compares
// them with the built HTML.
//
// Two rules hold everything here together:
//   1. A twin says what its page says. Nothing is added for crawlers, and the
//      body of a post, chapter or book note is the source file's own text.
//   2. What the site hides stays hidden: posts with `hidden: true`, unpublished
//      Scaling Book chapters (never synced), and MDX comments and expressions.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = process.cwd();
const file = (...parts) => path.join(ROOT, ...parts);
const read = (...parts) => fs.readFileSync(file(...parts), "utf8");
const readJson = (...parts) => JSON.parse(read(...parts));
const exists = (...parts) => fs.existsSync(file(...parts));

export const site = readJson("content", "site.json");
export const SITE_URL = site.url.replace(/\/+$/, "");

/** Absolute URL for a site path. External URLs pass through untouched. */
export function abs(urlPath) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(urlPath)) return urlPath;
  return SITE_URL + (urlPath.startsWith("/") ? urlPath : `/${urlPath}`);
}

/** Path of the Markdown twin for a page path. Mirrored in lib/site.ts. */
export function twinPath(urlPath) {
  return urlPath === "/" ? "/index.md" : `${urlPath}.md`;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * ISO form of the date strings used in frontmatter: "March 28, 2026",
 * "November 2023", "2026-06-04". Returns null for anything else rather than
 * guessing. Mirrored in lib/site.ts.
 */
export function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  let m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(text);
  if (m) return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
  m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month === -1) return null;
    return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = /^([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month === -1) return null;
    return `${m[2]}-${String(month + 1).padStart(2, "0")}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// MDX -> Markdown
// ---------------------------------------------------------------------------
//
// The source is parsed with the same parser the page is compiled with
// (next-mdx-remote with remark-gfm, plus remark-math for chapters), and only
// what the page does not show is cut out of the source text. Everything else is
// kept exactly as the author wrote it:
//   - `{...}` expressions, imports and exports are removed: next-mdx-remote
//     deletes expressions, and `{/* ... */}` comments render nothing anywhere.
//   - in plain-Markdown pages (format "md"), raw HTML is removed, because the
//     page drops it too (inline tags lose their tags, HTML blocks vanish).
//   - in MDX pages, presentational JSX (<span style={...}>, <sub>, <strong>)
//     loses its tags and keeps its text; <br/>, <a href> and <img> become their
//     Markdown equivalents; <video>, <audio> and <iframe> become a labelled link.
//     Any other component is left as written and reported.
//   - site-relative link and image URLs become absolute.
// Code, inline code and math are copied verbatim, never rewritten.

const WRAPPER_TAGS = new Set([
  "span", "div", "p", "section", "small", "sup", "sub", "em", "strong", "b", "i", "u",
  "s", "del", "mark", "abbr", "cite", "q", "center",
]);
const VERBATIM = new Set(["code", "inlineCode", "math", "inlineMath"]);
const REMOVED = new Set(["mdxjsEsm", "mdxFlowExpression", "mdxTextExpression", "html"]);

/** JSX the conversion left as written, reported by the generator. */
export const conversionWarnings = [];

let mdxTools = null;
async function loadMdxTools() {
  if (!mdxTools) {
    const [{ serialize }, { default: remarkGfm }, { default: remarkMath }] = await Promise.all([
      import("next-mdx-remote/serialize"),
      import("remark-gfm"),
      import("remark-math"),
    ]);
    mdxTools = { serialize, remarkGfm, remarkMath };
  }
  return mdxTools;
}

const isSiteRelative = (url) => typeof url === "string" && url.startsWith("/") && !url.startsWith("//");
const absUrl = (url) => (isSiteRelative(url) ? SITE_URL + url : url);

// Media a page shows with no text of its own. A twin names each one in a link,
// "[Video: wood-4x.mp4](url)", and the verifier reads the same label from the
// rendered element, so page and twin agree word for word.
export const MEDIA_KINDS = { video: "Video", audio: "Audio", iframe: "Embed" };

/** The words a twin uses for a media element: its title, else its file name. */
export function mediaLabel({ title, ariaLabel, src }) {
  const named = (title || ariaLabel || "").trim();
  if (named) return named.replace(/[\[\]]/g, "");
  const file = String(src || "").split(/[?#]/)[0].split("/").filter(Boolean).pop() || "media";
  let decoded = file;
  try {
    decoded = decodeURIComponent(file);
  } catch {
    // keep it as written
  }
  return decoded.replace(/[\[\]]/g, "");
}

/** A JSX attribute's value when it is a plain string, else null. */
const jsxAttribute = (node, name) => {
  const attr = (node.attributes || []).find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  return attr && typeof attr.value === "string" ? attr.value : null;
};

/** Edits that turn `source` into Markdown, found by walking its syntax tree. */
function planEdits(tree, source) {
  const edits = []; // { start, end, text }; an insertion has start === end
  const verbatim = []; // { start, end }
  const leftovers = [];

  // Offset where a link's or image's destination starts, if it is written inline.
  const destinationOffset = (node, start, end) => {
    const text = source.slice(start, end);
    let m = null;
    if (node.type === "image") m = /^!\[(?:[^\]\\]|\\.)*\]\([ \t]*<?/.exec(text);
    if (node.type === "definition") m = /^\[(?:[^\]\\]|\\.)*\]:[ \t]*\n?[ \t]*<?/.exec(text);
    if (node.type === "link") {
      const last = node.children.length ? node.children[node.children.length - 1].position : null;
      const labelEnd = last ? last.end.offset - start : 1;
      const rest = /^\]\([ \t]*<?/.exec(text.slice(labelEnd));
      return rest ? start + labelEnd + rest[0].length : null;
    }
    return m ? start + m[0].length : null;
  };

  // JSX: keep what the page shows, in Markdown form. Returns false to leave it as written.
  const convertJsx = (node, start, end) => {
    const name = String(node.name || "").toLowerCase();
    const children = node.children || [];
    const first = children[0] && children[0].position;
    const last = children.length && children[children.length - 1].position;
    const openEnd = first ? first.start.offset : end;
    const closeStart = last ? last.end.offset : end;

    if (name === "br") {
      edits.push({ start, end, text: "  \n" });
      return true;
    }
    if (name === "img") {
      const src = jsxAttribute(node, "src");
      if (src === null) return false;
      const alt = (jsxAttribute(node, "alt") || "").replace(/[\[\]]/g, "");
      edits.push({ start, end, text: `![${alt}](${absUrl(src)})` });
      return true;
    }
    if (MEDIA_KINDS[name]) {
      let src = jsxAttribute(node, "src");
      if (src === null) {
        const source = children.find(
          (c) => /^mdxJsx/.test(c.type) && String(c.name || "").toLowerCase() === "source"
        );
        if (source) src = jsxAttribute(source, "src");
      }
      if (src === null) return false;
      const label = mediaLabel({
        title: jsxAttribute(node, "title"),
        ariaLabel: jsxAttribute(node, "aria-label"),
        src,
      });
      edits.push({ start, end, text: `[${MEDIA_KINDS[name]}: ${label}](${absUrl(src)})` });
      return true;
    }
    if (name === "a") {
      const href = jsxAttribute(node, "href");
      if (href === null || !first) return false;
      edits.push({ start, end: openEnd, text: "[" });
      edits.push({ start: closeStart, end, text: `](${absUrl(href)})` });
      children.forEach(walk);
      return true;
    }
    if (WRAPPER_TAGS.has(name)) {
      if (!first) {
        edits.push({ start, end, text: "" });
        return true;
      }
      edits.push({ start, end: openEnd, text: "" });
      edits.push({ start: closeStart, end, text: "" });
      children.forEach(walk);
      return true;
    }
    return false;
  };

  const walk = (node) => {
    const pos = node.position;
    if (!pos || pos.start.offset == null) {
      (node.children || []).forEach(walk);
      return;
    }
    const start = pos.start.offset;
    const end = pos.end.offset;

    if (REMOVED.has(node.type)) {
      edits.push({ start, end, text: "" });
      return;
    }
    if (VERBATIM.has(node.type)) {
      verbatim.push({ start, end });
      return;
    }
    if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
      if (!convertJsx(node, start, end)) {
        leftovers.push(source.slice(start, Math.min(end, start + 60)));
        verbatim.push({ start, end });
      }
      return;
    }
    if ((node.type === "link" || node.type === "image" || node.type === "definition") && isSiteRelative(node.url)) {
      const at = destinationOffset(node, start, end);
      if (at !== null && source[at] === "/") edits.push({ start: at, end: at, text: SITE_URL });
    }
    (node.children || []).forEach(walk);
  };
  walk(tree);
  return { edits, verbatim, leftovers };
}

function applyEdits(source, { edits, verbatim }) {
  const marks = [
    ...edits.map((e) => ({ ...e, keep: false })),
    ...verbatim.map((v) => ({ ...v, keep: true, text: source.slice(v.start, v.end) })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  // Pieces of prose (edited) and verbatim text, in order.
  const pieces = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue; // nested inside something already handled
    pieces.push({ text: source.slice(cursor, mark.start), keep: false });
    pieces.push({ text: mark.text, keep: mark.keep });
    cursor = mark.end;
  }
  pieces.push({ text: source.slice(cursor), keep: false });

  // Blank lines left by removed nodes collapse, but never inside code or math.
  let out = "";
  let prose = "";
  for (const piece of pieces) {
    if (piece.keep) {
      out += prose.replace(/\n{3,}/g, "\n\n") + piece.text;
      prose = "";
    } else {
      prose += piece.text;
    }
  }
  return (out + prose.replace(/\n{3,}/g, "\n\n")).trim();
}

/**
 * Markdown for a page body, as the page renders it.
 *   format: "mdx" (posts, book notes, the home page) or "md" (chapters, resume)
 *   math:   parse $...$ as math, as the Scaling Book pages do
 */
export async function mdxToMarkdown(source, { format = "mdx", math = false, label = "" } = {}) {
  const { serialize, remarkGfm, remarkMath } = await loadMdxTools();
  let plan = null;
  const capture = () => (tree) => {
    plan = planEdits(tree, source);
  };
  await serialize(source, {
    mdxOptions: {
      format,
      development: false,
      remarkPlugins: [remarkGfm, ...(math ? [remarkMath] : []), capture],
    },
  });
  if (!plan) throw new Error(`could not parse ${label || "a page"} for its Markdown twin`);
  for (const jsx of plan.leftovers) conversionWarnings.push(`${label}: JSX left as written: ${jsx}`);
  return applyEdits(source, plan);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

// Shorter than this and a page is a placeholder ("Coming soon.", an empty
// chapter). Placeholders still get a twin, because the page exists, but
// llms.txt and llms-full.txt do not send readers to them.
const STUB_CHARS = 200;

function makeDoc(doc) {
  const body = doc.body.trim();
  return {
    description: "",
    date: "",
    ...doc,
    body,
    md: twinPath(doc.url),
    dateIso: isoDate(doc.date),
    stub: doc.listing ? false : body.length < STUB_CHARS,
  };
}

const HOME_SOURCE = ["pages", "index.mdx"];
const RESUME_SOURCE = ["content", "resume.md"];
export const RESUME_PDF = "/Edward-Chen-Resume.pdf";

async function homeDoc() {
  return makeDoc({
    kind: "home",
    url: "/",
    title: site.name,
    description: site.description,
    source: HOME_SOURCE.join("/"),
    ownHeading: true,
    body: await mdxToMarkdown(read(...HOME_SOURCE), { label: HOME_SOURCE.join("/") }),
  });
}

async function resumeDoc() {
  return makeDoc({
    kind: "resume",
    url: "/resume",
    title: "Resume",
    source: RESUME_SOURCE.join("/"),
    ownHeading: true,
    body: await mdxToMarkdown(matter(read(...RESUME_SOURCE)).content, {
      format: "md",
      label: RESUME_SOURCE.join("/"),
    }),
  });
}

/**
 * Matches a link to a hidden post's page or twin: /writing/<slug>, its .md,
 * a trailing slash, or a #fragment. Asset paths under /writing/<slug>/ (an
 * image or clip that a visible post uses) are not the post and do not match.
 */
export function hiddenPostPattern(slug) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`/writing/${escaped}(?![\\w-])(?!/[\\w.-])`);
}

// Ratings and bylines follow lib/book-format.ts (ratingOf, bookByline, bookListLine,
// compareByRating), so an unrated book reads the same on the page and here.
export function ratingOf(book) {
  const { rating } = book;
  if (rating === null || rating === undefined || rating === "") return null;
  const value = Number(rating);
  return Number.isFinite(value) ? value : null;
}
export function bookByline(book) {
  const rating = ratingOf(book);
  return [book.author && `By: ${book.author}`, book.date && `Read: ${book.date}`, rating !== null && `Rating: ${rating}/10`]
    .filter(Boolean)
    .join(" - ");
}
export function bookListLine(book) {
  const rating = ratingOf(book);
  return [book.date && `Read: ${book.date}`, rating !== null && `Rating: ${rating}/10`].filter(Boolean).join(" • ");
}
export function compareByRating(a, b) {
  const ra = ratingOf(a);
  const rb = ratingOf(b);
  if (ra === null && rb === null) return 0;
  if (ra === null) return 1;
  if (rb === null) return -1;
  return rb - ra;
}

/** Slugs of posts marked `hidden: true`. Read from the files, not the index. */
export function hiddenPostSlugs() {
  return fs
    .readdirSync(file("content", "writing"))
    .filter((name) => name.endsWith(".mdx"))
    .filter((name) => matter(read("content", "writing", name)).data.hidden === true)
    .map((name) => name.replace(/\.mdx$/, ""));
}

async function writingDocs() {
  const hidden = new Set(hiddenPostSlugs());
  const index = readJson("content", "writing", "index.json");
  const posts = [];
  const lines = [];

  for (const entry of index) {
    const slug = entry.external ? null : entry.url.replace(/^\/writing\//, "");
    if (slug && hidden.has(slug)) continue;
    lines.push(`- [${entry.title}](${abs(entry.url)}) — ${entry.date}`);
    if (!slug || !exists("content", "writing", `${slug}.mdx`)) continue;

    // Title, description and date come from the index, which is what the
    // page shows (gray-matter would turn an unquoted 2026-03-02 into a Date).
    const { content } = matter(read("content", "writing", `${slug}.mdx`));
    const source = `content/writing/${slug}.mdx`;
    posts.push(
      makeDoc({
        kind: "post",
        url: `/writing/${slug}`,
        title: String(entry.title ?? slug),
        description: entry.description ? String(entry.description) : "",
        date: entry.date ? String(entry.date) : "",
        image: entry.image ? String(entry.image) : "",
        source,
        body: await mdxToMarkdown(content, { label: source }),
      })
    );
  }

  const listing = makeDoc({
    kind: "writing-index",
    url: "/writing",
    title: "Writing",
    listing: true,
    source: "content/writing/index.json",
    body: lines.join("\n"),
  });
  return { listing, posts };
}

async function scalingBookDocs() {
  const manifestPath = ["content", "writing", "scaling-book", "index.json"];
  const manifest = exists(...manifestPath) ? readJson(...manifestPath) : [];
  const officialTitles = readJson("content", "scaling-book-titles.json");
  const bookUrl = "/writing/scaling-book";

  const chapters = [];
  for (const [i, entry] of manifest.entries()) {
    const { content } = matter(read("content", "writing", "scaling-book", `${entry.slug}.mdx`));
    const prev = manifest[i - 1];
    const next = manifest[i + 1];
    const nav = [
      prev && `← [${prev.title}](${abs(`${bookUrl}/${prev.slug}`)})`,
      next && `[${next.title}](${abs(`${bookUrl}/${next.slug}`)}) →`,
    ].filter(Boolean);
    const source = `content/writing/scaling-book/${entry.slug}.mdx`;
    chapters.push(makeDoc({
        kind: "chapter",
        url: `${bookUrl}/${entry.slug}`,
        title: entry.title,
        description: entry.description || "",
        date: entry.date || "",
        order: entry.order,
        listTitle: `Chapter ${entry.order}: ${officialTitles[entry.order] ?? entry.title}`,
        source: `0x3ddie/notes: One/Scaling Book (synced to content/writing/scaling-book/${entry.slug}.mdx)`,
        intro: `[Scaling Book](${abs(bookUrl)})`,
        outro: nav.join(" · "),
        body: await mdxToMarkdown(content, { format: "md", math: true, label: source }),
      }));
  }

  const intro =
    "Working through the [Scaling Book](https://jax-ml.github.io/scaling-book/). " +
    "Each chapter below collects my depth notes alongside worked solutions to the chapter problems. " +
    "Source lives in my [notes vault](https://github.com/0x3ddie/notes/tree/main/One/Scaling%20Book) " +
    "and is auto-synced here on push.";
  const list = chapters.length
    ? chapters
        .map((c) => `## [${c.listTitle}](${abs(c.url)})${c.description ? `\n\n${c.description}` : ""}`)
        .join("\n\n")
    : "No chapters published yet — check back soon.";

  const listing = makeDoc({
    kind: "scaling-book-index",
    url: bookUrl,
    title: "Scaling Book — Notes & Solutions",
    description:
      "My chapter-by-chapter notes and worked problems on the Scaling Book. Synced from my notes vault.",
    listing: true,
    source: "content/writing/scaling-book/index.json",
    body: `${intro}\n\n${list}`,
  });
  return { listing, chapters };
}

async function readingDocs() {
  const index = readJson("content", "books", "index.json");
  const books = [];
  for (const entry of index) {
    const slug = entry.slug.replace(/^\/reading\//, "");
    const { content } = matter(read("content", "books", `${slug}.mdx`));
    const byline = bookByline(entry);
    const source = `content/books/${slug}.mdx`;
    books.push(makeDoc({
      kind: "book",
      url: entry.slug,
      title: entry.title,
      author: entry.author,
      rating: ratingOf(entry),
      description: byline,
      date: entry.date,
      source,
      intro: byline,
      // The index page shows everything above "## My Notes", like the site does.
      summary: await mdxToMarkdown(content.split("## My Notes")[0], { label: source }),
      body: await mdxToMarkdown(content, { label: source }),
    }));
  }

  // Same order as the page: highest rating first, ties in index order.
  const byRating = books.slice().sort(compareByRating);
  const listing = makeDoc({
    kind: "reading-index",
    url: "/reading",
    title: "Reading",
    listing: true,
    source: "content/books/index.json",
    body: byRating
      .map(
        (b) =>
          [`## [${b.title}](${abs(b.url)})`, b.author, bookListLine(b), b.summary].filter(Boolean).join("\n\n")
      )
      .join("\n\n"),
  });
  return { listing, books };
}

// Mirrors SECTIONS in pages/engineering/index.tsx: anything not marked "fun"
// is a personal project.
const PROJECT_SECTIONS = [
  { label: "personal projects", matches: (b) => b.category !== "fun" },
  { label: "for fun", matches: (b) => b.category === "fun" },
];

function projectsDoc() {
  const builds = readJson("content", "engineering", "index.json");
  const sections = PROJECT_SECTIONS.map(({ label, matches }) => ({
    label,
    builds: builds.filter(matches),
  })).filter((section) => section.builds.length > 0);

  const body = sections
    .map(
      ({ label, builds: list }) =>
        `## ${label}\n\n` +
        list
          .map((b) => `### ${b.url ? `[${b.title}](${abs(b.url)})` : b.title}\n\n${b.description}`)
          .join("\n\n")
    )
    .join("\n\n");

  return {
    sections,
    doc: makeDoc({
      kind: "projects",
      url: "/engineering",
      title: "Projects",
      listing: true,
      source: "content/engineering/external.json",
      body,
    }),
  };
}

/** Every public page, in the order llms-full.txt presents them. */
export async function loadSite() {
  const home = await homeDoc();
  const resume = await resumeDoc();
  const projects = projectsDoc();
  const writing = await writingDocs();
  const scalingBook = await scalingBookDocs();
  const reading = await readingDocs();

  const docs = [
    home,
    resume,
    projects.doc,
    writing.listing,
    ...writing.posts,
    scalingBook.listing,
    ...scalingBook.chapters,
    reading.listing,
    ...reading.books,
  ];

  return {
    docs,
    home,
    resume,
    projects,
    writing,
    scalingBook,
    reading,
    hiddenSlugs: hiddenPostSlugs(),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const yamlString = (value) => JSON.stringify(String(value));

/** The Markdown twin of one page: a short header, then what the page says. */
export function renderTwin(doc) {
  const front = [
    "---",
    `title: ${yamlString(doc.title)}`,
    doc.description && `description: ${yamlString(doc.description)}`,
    `author: ${yamlString(site.name)}`,
    doc.dateIso && `date: ${doc.dateIso}`,
    `url: ${abs(doc.url)}`,
    "---",
  ].filter(Boolean);

  const parts = [front.join("\n")];
  if (!doc.ownHeading) parts.push(`# ${doc.title}`);
  if (doc.intro) parts.push(doc.intro);
  if (doc.body) parts.push(doc.body);
  if (doc.outro) parts.push(doc.outro);
  return parts.join("\n\n") + "\n";
}

/** The same document as a section of llms-full.txt. */
export function renderSection(doc) {
  const heading = doc.ownHeading ? null : `# ${doc.title}`;
  const meta = [`Source: ${abs(doc.url)}`, doc.date && `Date: ${doc.date}`]
    .filter(Boolean)
    .join("\n");
  let body = doc.body;
  if (doc.ownHeading) {
    // Keep the page's own H1 first, then the source line.
    const [first, ...rest] = body.split("\n");
    return [first, meta, rest.join("\n").trim()].filter(Boolean).join("\n\n");
  }
  return [heading, meta, doc.intro, body, doc.outro].filter(Boolean).join("\n\n");
}
