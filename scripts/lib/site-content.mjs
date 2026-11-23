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
// (next-mdx-remote; remark-gfm where the page uses it; remark-math for
// chapters), and only what the page does not show is cut out of the source
// text. Everything else is kept exactly as the author wrote it:
//   - `{...}` expressions, imports and exports are removed: next-mdx-remote
//     deletes expressions, and `{/* ... */}` comments render nothing anywhere.
//     This applies inside JSX too, at any depth.
//   - in plain-Markdown pages (format "md"), raw HTML is removed, because the
//     page drops it too (inline tags lose their tags, HTML blocks vanish).
//   - in MDX pages, HTML elements keep their text and lose their tags (block
//     elements become their own lines, headings and list items keep their
//     Markdown form); <sup> and <sub> stay as HTML so 10<sup>14</sup> is not
//     flattened to 1014; <br/>, <a href> and <img> become their Markdown
//     equivalents; <video>, <audio> and <iframe> become a labelled link.
//     A component (a capitalised name) cannot be mirrored and is an error.
//   - site-relative link and image URLs become absolute.
// Code, inline code and math are copied verbatim, never rewritten.

const INLINE_TAGS = new Set([
  "span", "small", "em", "strong", "b", "i", "u", "s", "del", "ins", "mark", "abbr", "cite",
  "q", "kbd", "code", "samp", "var", "time", "dfn", "bdi", "bdo", "data", "label", "font",
]);
const KEEP_AS_HTML = new Set(["sup", "sub"]);
const BLOCK_TAGS = new Set([
  "div", "p", "section", "article", "aside", "header", "footer", "main", "nav", "address",
  "figure", "figcaption", "details", "summary", "blockquote", "center", "pre",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "ul", "ol", "dl", "dt", "dd",
]);
const VERBATIM = new Set(["code", "inlineCode", "math", "inlineMath"]);
const REMOVED = new Set(["mdxjsEsm", "mdxFlowExpression", "mdxTextExpression", "html"]);

/** Things a twin cannot mirror. The generator stops a build on them and warns under --dev. */
export const conversionProblems = [];

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

/**
 * Text from frontmatter or JSON placed into Markdown: characters Markdown would
 * read as syntax are escaped, so a title like "On <think> tags" stays text.
 */
export function mdText(value) {
  return String(value ?? "")
    .replace(/[\\`*[\]<]/g, "\\$&")
    .replace(/&(?=#?\w+;)/g, "\\&")
    .replace(/(^|\W)_|_(?=\W|$)/g, (m) => m.replace("_", "\\_"));
}

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
  const components = [];

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

  // The indentation of the line a child starts on, so a converted block keeps
  // its place inside a list item.
  const indentBefore = (offset) => {
    const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
    const lead = /^[ \t]*/.exec(source.slice(lineStart, offset))[0];
    return lead.length === offset - lineStart ? lead : "";
  };

  // Replace an element's opening and closing tags, keep and walk its children.
  const replaceTags = (node, start, end, open, close) => {
    const children = node.children || [];
    if (!children.length || !children[0].position) {
      edits.push({ start, end, text: open + close });
      return;
    }
    const first = children[0].position.start.offset;
    const last = children[children.length - 1].position.end.offset;
    edits.push({ start, end: first, text: open });
    edits.push({ start: last, end, text: close });
    const name = String(node.name || "").toLowerCase();
    children.forEach((child) => walk(child, name));
  };

  // JSX: keep what the page shows, in Markdown form.
  const convertJsx = (node, start, end, parentName) => {
    const rawName = String(node.name || "");
    const name = rawName.toLowerCase();
    const children = node.children || [];
    const firstChild = children[0] && children[0].position;
    const indent = firstChild ? indentBefore(firstChild.start.offset) : "";

    if (!rawName || /^[A-Z]/.test(rawName) || rawName.includes(".")) {
      // A component: its output is not knowable here. Keep the tags, still
      // remove comments and expressions inside, and report it.
      components.push(`<${rawName || "fragment"}>`);
      if (firstChild) {
        const first = firstChild.start.offset;
        const last = children[children.length - 1].position.end.offset;
        verbatim.push({ start, end: first });
        verbatim.push({ start: last, end });
        children.forEach((child) => walk(child, ""));
      } else {
        verbatim.push({ start, end });
      }
      return;
    }
    if (name === "br") return edits.push({ start, end, text: "  \n" });
    if (name === "hr") return edits.push({ start, end, text: "\n\n---\n\n" });
    if (name === "img") {
      const src = jsxAttribute(node, "src");
      if (src === null) return edits.push({ start, end, text: "" });
      const alt = (jsxAttribute(node, "alt") || "").replace(/[\[\]]/g, "");
      return edits.push({ start, end, text: `![${alt}](${absUrl(src)})` });
    }
    if (MEDIA_KINDS[name]) {
      let src = jsxAttribute(node, "src");
      if (src === null) {
        const sourceEl = children.find((c) => /^mdxJsx/.test(c.type) && String(c.name || "").toLowerCase() === "source");
        if (sourceEl) src = jsxAttribute(sourceEl, "src");
      }
      const label = mediaLabel({
        title: jsxAttribute(node, "title"),
        ariaLabel: jsxAttribute(node, "aria-label"),
        src,
      });
      // The fallback text inside a media element is not shown by browsers that play it.
      return edits.push({ start, end, text: src === null ? "" : `[${MEDIA_KINDS[name]}: ${label}](${absUrl(src)})` });
    }
    if (name === "a") {
      const href = jsxAttribute(node, "href");
      if (href === null || !firstChild) return replaceTags(node, start, end, "", "");
      return replaceTags(node, start, end, "[", `](${absUrl(href)})`);
    }
    if (KEEP_AS_HTML.has(name)) return replaceTags(node, start, end, `<${name}>`, `</${name}>`);
    if (name === "code") return replaceTags(node, start, end, "`", "`");
    const heading = /^h([1-6])$/.exec(name);
    if (heading) return replaceTags(node, start, end, `\n\n${indent}${"#".repeat(Number(heading[1]))} `, "\n\n");
    if (name === "li") {
      const marker = parentName === "ol" ? "1. " : "- ";
      return replaceTags(node, start, end, `\n${indent}${marker}`, "\n");
    }
    if (BLOCK_TAGS.has(name)) return replaceTags(node, start, end, `\n\n${indent}`, "\n\n");
    // Any other HTML element (INLINE_TAGS and the rest): text without tags.
    return replaceTags(node, start, end, "", "");
  };

  const walk = (node, parentName = "") => {
    const pos = node.position;
    if (!pos || pos.start.offset == null) {
      (node.children || []).forEach((c) => walk(c, parentName));
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
      convertJsx(node, start, end, parentName);
      return;
    }
    if ((node.type === "link" || node.type === "image" || node.type === "definition") && isSiteRelative(node.url)) {
      const at = destinationOffset(node, start, end);
      if (at !== null && source[at] === "/") edits.push({ start: at, end: at, text: SITE_URL });
    }
    // A Markdown paragraph inside <ol>/<ul> still belongs to that list.
    (node.children || []).forEach((c) => walk(c, node.type === "paragraph" ? parentName : ""));
  };
  walk(tree);
  return { edits, verbatim, components };
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
  const tidy = (text) => text.replace(/^[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  let out = "";
  let prose = "";
  for (const piece of pieces) {
    if (piece.keep) {
      out += tidy(prose) + piece.text;
      prose = "";
    } else {
      prose += piece.text;
    }
  }
  return (out + tidy(prose)).trim();
}

/**
 * Markdown for a page body, as the page renders it.
 *   format: "mdx" (posts, book notes, the home page) or "md" (chapters, resume)
 *   gfm:    parse GitHub-flavoured Markdown, as every page except the home page
 *           and the reading-list summaries does
 *   math:   parse $...$ as math, as the Scaling Book pages do
 */
export async function mdxToMarkdown(source, { format = "mdx", gfm = true, math = false, label = "" } = {}) {
  const { serialize, remarkGfm, remarkMath } = await loadMdxTools();
  let plan = null;
  const capture = () => (tree) => {
    plan = planEdits(tree, source);
  };
  try {
    await serialize(source, {
      mdxOptions: {
        format,
        development: false,
        remarkPlugins: [...(gfm ? [remarkGfm] : []), ...(math ? [remarkMath] : []), capture],
      },
    });
  } catch (error) {
    throw new Error(`${label || "a page"}: ${String(error.message).split("\n").slice(0, 3).join(" ")}`);
  }
  if (!plan) throw new Error(`${label || "a page"}: could not be parsed for its Markdown twin`);
  for (const tag of plan.components) {
    conversionProblems.push(`${label}: the component ${tag} cannot be mirrored in Markdown; use plain Markdown or HTML elements`);
  }
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
    gfm: true,
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
    // @next/mdx compiles the home page without remark-gfm (next.config.js).
    gfm: false,
    body: await mdxToMarkdown(read(...HOME_SOURCE), { gfm: false, label: HOME_SOURCE.join("/") }),
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

/**
 * Slugs of posts marked `hidden: true`. Read from the files, not the index.
 * A near miss (`hidden: "true"`, `Hidden: true`, `draft: true`) would publish
 * the post while its author thinks it is hidden, so it is reported.
 */
export function hiddenPostSlugs() {
  const hidden = [];
  for (const name of fs.readdirSync(file("content", "writing")).filter((n) => n.endsWith(".mdx"))) {
    const { data } = matter(read("content", "writing", name));
    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if ((lower === "hidden" && (key !== "hidden" || typeof value !== "boolean")) || lower === "draft" || lower === "published") {
        conversionProblems.push(
          `content/writing/${name}: \`${key}: ${JSON.stringify(value)}\` does not hide a post; only \`hidden: true\` does`
        );
      }
    }
    if (data.hidden === true) hidden.push(name.replace(/\.mdx$/, ""));
  }
  return hidden;
}

async function writingDocs() {
  const hidden = new Set(hiddenPostSlugs());
  const index = readJson("content", "writing", "index.json");
  const posts = [];
  const lines = [];

  for (const entry of index) {
    const slug = entry.external ? null : entry.url.replace(/^\/writing\//, "");
    if (slug && hidden.has(slug)) continue;
    lines.push(`- [${mdText(entry.title)}](${abs(entry.url)}) — ${mdText(entry.date)}`);
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

export const scalingBook = readJson("content", "scaling-book.json");

async function scalingBookDocs() {
  const manifestPath = ["content", "writing", "scaling-book", "index.json"];
  const manifest = exists(...manifestPath) ? readJson(...manifestPath) : [];
  const officialTitles = scalingBook.officialTitles;
  const bookUrl = "/writing/scaling-book";

  const chapters = [];
  for (const [i, entry] of manifest.entries()) {
    const { content } = matter(read("content", "writing", "scaling-book", `${entry.slug}.mdx`));
    const prev = manifest[i - 1];
    const next = manifest[i + 1];
    const nav = [
      prev && `← [${mdText(prev.title)}](${abs(`${bookUrl}/${prev.slug}`)})`,
      next && `[${mdText(next.title)}](${abs(`${bookUrl}/${next.slug}`)}) →`,
    ].filter(Boolean);
    const source = `content/writing/scaling-book/${entry.slug}.mdx`;
    chapters.push(
      makeDoc({
        kind: "chapter",
        url: `${bookUrl}/${entry.slug}`,
        title: entry.title,
        description: entry.description || "",
        date: entry.date || "",
        order: entry.order,
        listTitle: `Chapter ${entry.order}: ${officialTitles[entry.order] ?? entry.title}`,
        source: `0x3ddie/notes: One/Scaling Book (synced to ${source})`,
        intro: `[${mdText(scalingBook.book.name)}](${abs(bookUrl)})`,
        outro: nav.join(" · "),
        body: await mdxToMarkdown(content, { format: "md", math: true, label: source }),
      })
    );
  }

  const intro = scalingBook.intro
    .map((part) => (part.href ? `[${mdText(part.text)}](${part.href})` : mdText(part.text)))
    .join("");
  const list = chapters.length
    ? chapters
        .map((c) => `## [${mdText(c.listTitle)}](${abs(c.url)})${c.description ? `\n\n${mdText(c.description)}` : ""}`)
        .join("\n\n")
    : "No chapters published yet — check back soon.";

  const listing = makeDoc({
    kind: "scaling-book-index",
    url: bookUrl,
    title: scalingBook.title,
    description: scalingBook.description,
    listing: true,
    source: "content/scaling-book.json and content/writing/scaling-book/index.json",
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
    books.push(
      makeDoc({
        kind: "book",
        url: entry.slug,
        title: entry.title,
        author: entry.author,
        rating: ratingOf(entry),
        description: byline,
        date: entry.date,
        source,
        intro: mdText(byline),
        // The reading list shows everything above "## My Notes", compiled
        // without remark-gfm (scripts/generate-content.mjs), like the site does.
        summary: await mdxToMarkdown(content.split("## My Notes")[0], { gfm: false, label: source }),
        body: await mdxToMarkdown(content, { label: source }),
      })
    );
  }

  // Same order as the page: highest rating first, unrated last, ties in index order.
  const byRating = books.slice().sort(compareByRating);
  const listing = makeDoc({
    kind: "reading-index",
    url: "/reading",
    title: "Reading",
    listing: true,
    gfm: false,
    source: "content/books/index.json",
    body: byRating
      .map((b) =>
        [`## [${mdText(b.title)}](${abs(b.url)})`, mdText(b.author), mdText(bookListLine(b)), b.summary]
          .filter(Boolean)
          .join("\n\n")
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
        `## ${mdText(label)}\n\n` +
        list
          .map((b) => `### ${b.url ? `[${mdText(b.title)}](${abs(b.url)})` : mdText(b.title)}\n\n${mdText(b.description)}`)
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

/**
 * The Markdown twin of one page: a short header, then what the page says.
 * The header says whose words these are: Eddie's own pages name him as the
 * author; book notes and Scaling Book chapters name him as the note-taker and
 * name the book, so nothing reads as him having written someone else's book.
 */
export function renderTwin(doc) {
  const fields = [["title", yamlString(doc.title)]];
  if (doc.description) fields.push(["description", yamlString(doc.description)]);
  if (doc.kind === "book") {
    fields.push(["book_author", yamlString(doc.author)]);
    fields.push(["notes_by", yamlString(site.name)]);
    if (doc.dateIso) fields.push(["date_read", doc.dateIso]);
    if (doc.rating !== null && doc.rating !== undefined) fields.push(["rating", `${doc.rating}/10`]);
  } else if (doc.kind === "chapter") {
    fields.push(["notes_by", yamlString(site.name)]);
    fields.push(["notes_on", yamlString(scalingBook.book.name)]);
    fields.push(["based_on", scalingBook.book.url]);
    if (doc.dateIso) fields.push(["date", doc.dateIso]);
  } else {
    fields.push(["author", yamlString(site.name)]);
    if (doc.dateIso) fields.push(["date", doc.dateIso]);
  }
  fields.push(["url", abs(doc.url)]);
  const front = ["---", ...fields.map(([k, v]) => `${k}: ${v}`), "---"].join("\n");

  const parts = [front];
  if (!doc.ownHeading) parts.push(`# ${mdText(doc.title)}`);
  if (doc.intro) parts.push(doc.intro);
  if (doc.body) parts.push(doc.body);
  if (doc.outro) parts.push(doc.outro);
  return parts.join("\n\n") + "\n";
}

/** A twin without its frontmatter block. */
export function twinBody(twinText) {
  return twinText.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

/** The opening of llms-full.txt. */
export function llmsFullHeader() {
  return [
    `# ${mdText(site.name)} — full site content`,
    `> ${mdText(site.description)}`,
    `Every page of ${SITE_URL} with real content, in one file: each section is that page's Markdown twin, preceded by its address. Index: ${abs("/llms.txt")}`,
  ].join("\n\n");
}

/**
 * One section of llms-full.txt: the page's twin, exactly, after a line naming
 * the page. The verifier rebuilds the file from the twins and compares.
 */
export function llmsFullSection(page, twinText) {
  const meta = [`Source: ${abs(page.url)}`, page.date && `Date: ${page.date}`].filter(Boolean).join("\n");
  return `${meta}\n\n${twinBody(twinText).trim()}`;
}

export const LLMS_FULL_SEPARATOR = "\n\n---\n\n";
