// Checks the generated Markdown twins against the built site. Runs at the end
// of `npm run build`, after `next build` has written the HTML pages.
//
// For every page it renders the twin through the same MDX renderer the site
// uses and compares it with the page's <main>:
//   - words: the same words the same number of times, in both directions
//     (words on the page missing from the twin, or words in the twin that the
//     page does not show). Word order and punctuation are not compared.
//   - link and image targets: the same set on both sides.
//   - superscripts and subscripts: kept as such, not flattened into the text.
// It also checks that each page links its twin and names itself as canonical,
// that every built page has a twin, that hidden posts appear nowhere, that
// llms-full.txt is exactly the twins, that every llms.txt link resolves, that
// the site description says nothing a visitor cannot read, that the Scaling
// Book chapters arrived, and that content/resume.md matches the resume PDF.
//
// A failure stops the build. SKIP_MIRROR_VERIFY=1 turns failures into warnings.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import { extractPdfText } from "./lib/pdf-text.mjs";
import {
  site,
  SITE_URL,
  hiddenPostPattern,
  MEDIA_KINDS,
  mediaLabel,
  llmsFullHeader,
  llmsFullSection,
  LLMS_FULL_SEPARATOR,
  twinBody,
} from "./lib/site-content.mjs";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const PAGES_DIR = path.join(ROOT, ".next", "server", "pages");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "llm-mirrors.json"), "utf8"));
const abs = (p) => SITE_URL + p;
const verbose = process.argv.includes("--verbose");

// Built pages that have no twin on purpose.
const NO_TWIN = new Set(["/404", "/500", "/deep-dives"]);

// --- text extraction --------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);

/** Removes every element that starts at a match of `open`, nested content included. */
function removeElements(html, tag, open) {
  let out = "";
  let pos = 0;
  const tags = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "gi");
  for (;;) {
    open.lastIndex = pos;
    const start = open.exec(html);
    if (!start) break;
    out += html.slice(pos, start.index);
    tags.lastIndex = start.index;
    let depth = 0;
    let end = html.length;
    let m;
    while ((m = tags.exec(html))) {
      depth += m[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = m.index + m[0].length;
        break;
      }
    }
    pos = end;
  }
  return out + html.slice(pos);
}

const attribute = (attrs, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`, "i").exec(attrs);
  return m ? decodeEntities(m[1]) : null;
};

/** The file a media element plays: its src, else its first <source>. */
const mediaSource = (attrs, inner) => {
  const source = /<source\b([^>]*)>/i.exec(inner || "");
  return attribute(attrs, "src") ?? (source ? attribute(source[1], "src") : null);
};

// A media element has no text; read it as the label its twin's link uses.
function mediaAsText(tag, attrs, inner) {
  const label = mediaLabel({
    title: attribute(attrs, "title"),
    ariaLabel: attribute(attrs, "aria-label"),
    src: mediaSource(attrs, inner),
  });
  return ` ${MEDIA_KINDS[tag.toLowerCase()]} ${label} `;
}

// Elements whose tags do not separate words. Mirrors INLINE_TAGS and
// KEEP_AS_HTML in scripts/lib/site-content.mjs.
const INLINE_TAGS = new Set([
  "a", "span", "strong", "em", "b", "i", "code", "sup", "sub", "u", "s", "del", "ins", "mark",
  "small", "abbr", "cite", "q", "kbd", "samp", "var", "time", "dfn", "bdi", "bdo", "data",
  "label", "font",
]);

/** The page area a twin mirrors: <main> without navigation and KaTeX's duplicate rendering. */
function contentHtml(html) {
  let text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    // React's server renderer separates adjacent text nodes with <!-- -->.
    .replace(/<!--[\s\S]*?-->/g, "");
  text = removeElements(text, "span", /<span class="katex-html"[^>]*>/g);
  text = removeElements(text, "nav", /<nav\b[^>]*>/g);
  // remark-gfm's footnote heading; the post pages remove it, chapters keep it.
  text = removeElements(text, "h2", /<h2\b[^>]*id="footnote-label"[^>]*>/g);
  return text;
}

function htmlToText(html) {
  let text = contentHtml(html).replace(/<(video|audio|iframe)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_, tag, attrs, inner) =>
    mediaAsText(tag, attrs, inner)
  );
  // KaTeX keeps each formula's TeX in a MathML annotation; that is what the Markdown holds.
  text = text.replace(
    /<math\b[\s\S]*?<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>[\s\S]*?<\/math>/g,
    (_, tex) => ` ${tex} `
  );
  text = text.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_, name) =>
    INLINE_TAGS.has(name.toLowerCase()) ? "" : " "
  );
  return decodeEntities(text);
}

/** Link, image and media targets, made absolute against the page's own address. */
function targets(html, pageUrl) {
  const base = SITE_URL + (pageUrl === "/" ? "/" : pageUrl);
  const resolve = (href) => {
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  };
  const content = contentHtml(html);
  const links = [];
  const images = [];
  for (const m of content.matchAll(/<a\b([^>]*)>/gi)) {
    const href = attribute(m[1], "href");
    if (href !== null) links.push(resolve(href));
  }
  for (const m of content.matchAll(/<(video|audio|iframe)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const src = mediaSource(m[2], m[3]);
    if (src !== null) links.push(resolve(src)); // the twin links each media file
  }
  for (const m of content.matchAll(/<img\b([^>]*)>/gi)) {
    const src = attribute(m[1], "src");
    if (src !== null) images.push(resolve(src));
  }
  return { links, images };
}

/** Text of each superscript and subscript that is not a footnote marker. */
function supSubs(html) {
  const found = [];
  for (const m of contentHtml(html).matchAll(/<(sup|sub)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    if (/data-footnote-ref|user-content-fn/.test(m[2])) continue;
    found.push(`${m[1].toLowerCase()}:${tokens(decodeEntities(m[2].replace(/<[^>]+>/g, ""))).join(" ")}`);
  }
  return found;
}

const tokens = (text) => text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

function countTokens(list) {
  const counts = new Map();
  for (const t of list) counts.set(t, (counts.get(t) || 0) + 1);
  return counts;
}

/** Items in `a` that `b` does not have (with multiplicity). */
function missing(a, b) {
  const out = [];
  for (const [token, n] of a) {
    const short = n - (b.get(token) || 0);
    for (let i = 0; i < short; i++) out.push(token);
  }
  return out;
}

// The twin is rendered with the site's own pipeline (next-mdx-remote, React),
// as plain Markdown, with remark-gfm where the page uses it and math for
// chapters, so both sides of the comparison are HTML produced the same way.
// NODE_ENV is set before the imports load because next-mdx-remote picks its
// JSX runtime from it.
process.env.NODE_ENV = "production";
const [
  { default: React },
  { renderToStaticMarkup },
  { serialize },
  { MDXRemote },
  { default: remarkGfm },
  { default: remarkMath },
  { default: rehypeKatex },
] = await Promise.all([
  import("react"),
  import("react-dom/server"),
  import("next-mdx-remote/serialize"),
  import("next-mdx-remote"),
  import("remark-gfm"),
  import("remark-math"),
  import("rehype-katex"),
]);

async function renderTwin(markdown, { math = false, gfm = true } = {}) {
  const { compiledSource } = await serialize(markdown, {
    parseFrontmatter: true,
    mdxOptions: {
      format: "md",
      development: false,
      remarkPlugins: [...(gfm ? [remarkGfm] : []), ...(math ? [remarkMath] : [])],
      rehypePlugins: math ? [rehypeKatex] : [],
    },
  });
  return renderToStaticMarkup(React.createElement(MDXRemote, { compiledSource, frontmatter: {}, scope: {} }));
}

// --- checks -----------------------------------------------------------------

const failures = [];
const notes = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
const sample = (list, n = 12) => [...new Set(list)].slice(0, n).join(" ");
const readPublic = (p) => fs.readFileSync(path.join(PUBLIC_DIR, p), "utf8");

function htmlFile(url) {
  return path.join(PAGES_DIR, url === "/" ? "index.html" : `${url.slice(1)}.html`);
}

const pageTexts = new Map(); // url -> visible text of <main>, for the description check

async function checkPage(page) {
  const file = htmlFile(page.url);
  if (!fs.existsSync(file)) return fail(page.url, `no built page at ${path.relative(ROOT, file)}`);
  const html = fs.readFileSync(file, "utf8");
  const twinFile = path.join(PUBLIC_DIR, page.md);
  if (!fs.existsSync(twinFile)) return fail(page.url, `no twin at public${page.md}`);
  const twin = fs.readFileSync(twinFile, "utf8");

  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html);
  if (!canonical || canonical[1] !== abs(page.url)) {
    fail(page.url, `canonical is ${canonical ? canonical[1] : "missing"}, expected ${abs(page.url)}`);
  }
  const alternate = /<link rel="alternate" type="text\/markdown" href="([^"]+)"/.exec(html);
  if (!alternate || alternate[1] !== abs(page.md)) {
    fail(page.url, `Markdown alternate link is ${alternate ? alternate[1] : "missing"}, expected ${abs(page.md)}`);
  }
  if (!twin.includes(`\nurl: ${abs(page.url)}\n`)) {
    fail(page.md, "twin does not name its page in `url:`");
  }
  // The twin's description is the page's meta description, not a separate claim.
  const metaDescription = /<meta name="description" content="([^"]*)"/.exec(html);
  const twinDescription = /\ndescription: ("(?:[^"\\]|\\.)*")\n/.exec(twin);
  if (twinDescription) {
    const said = JSON.parse(twinDescription[1]);
    const shown = metaDescription ? decodeEntities(metaDescription[1]) : null;
    if (shown !== said) {
      fail(page.md, `description is "${said}" but the page's meta description is "${shown}"`);
    }
  }

  const main = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html);
  if (!main) return fail(page.url, "page has no <main>");
  pageTexts.set(page.url, htmlToText(main[1]));

  // The resume page shows the PDF in a frame; its twin is checked against the PDF.
  if (page.kind === "resume") return;

  let twinHtml;
  try {
    twinHtml = await renderTwin(twin, { math: page.kind === "chapter", gfm: page.gfm !== false });
  } catch (error) {
    return fail(page.md, `twin does not render as Markdown: ${String(error.message).split("\n")[0]}`);
  }

  // Words, both ways. The page's <title> may supply the twin's heading on
  // listing pages that show none.
  const title = /<title>([\s\S]*?)<\/title>/.exec(html);
  const pageWords = countTokens(tokens(htmlToText(main[1])));
  const pageAndTitle = countTokens([...tokens(htmlToText(main[1])), ...tokens(decodeEntities(title ? title[1] : ""))]);
  const twinWords = countTokens(tokens(htmlToText(twinHtml)));
  const notInTwin = missing(pageWords, twinWords);
  const notOnPage = missing(twinWords, pageAndTitle);
  const total = [...pageWords.values()].reduce((a, b) => a + b, 0);
  if (notInTwin.length) {
    fail(page.url, `${notInTwin.length} of ${total} words on the page are missing from ${page.md}: ${sample(notInTwin)}`);
  }
  if (notOnPage.length) {
    fail(page.md, `${notOnPage.length} words in the twin are not on the page ${page.url}: ${sample(notOnPage)}`);
  }

  // Link and image targets.
  const onPage = targets(main[1], page.url);
  const inTwin = targets(twinHtml, page.url);
  const linkGap = missing(countTokens(onPage.links), countTokens(inTwin.links));
  const linkExtra = missing(countTokens(inTwin.links), countTokens(onPage.links));
  if (linkGap.length) fail(page.md, `links on the page are missing from the twin: ${sample(linkGap, 5)}`);
  if (linkExtra.length) fail(page.md, `the twin links what the page does not: ${sample(linkExtra, 5)}`);
  const imageExtra = missing(countTokens(inTwin.images), countTokens(onPage.images));
  if (imageExtra.length) fail(page.md, `the twin shows images the page does not: ${sample(imageExtra, 5)}`);
  // The reading list's cover images are decoration the twin leaves out.
  if (page.kind !== "reading-index") {
    const imageGap = missing(countTokens(onPage.images), countTokens(inTwin.images));
    if (imageGap.length) fail(page.md, `images on the page are missing from the twin: ${sample(imageGap, 5)}`);
  }

  // Superscripts and subscripts must still be marked as such in the twin.
  const pageSup = countTokens(supSubs(main[1]));
  const twinSup = countTokens(
    [...twinBody(twin).matchAll(/<(sup|sub)>([\s\S]*?)<\/\1>/gi)].map(
      (m) => `${m[1].toLowerCase()}:${tokens(m[2]).join(" ")}`
    )
  );
  const flattened = missing(pageSup, twinSup);
  if (flattened.length) {
    fail(page.md, `superscripts or subscripts on the page are not marked in the twin: ${sample(flattened, 5)}`);
  }

  if (verbose) notes.push(`ok ${page.url} (${total} words, ${onPage.links.length} links)`);
}

/** Every built HTML page has a twin, except the ones exempted above. */
function checkEveryPageHasTwin() {
  const listed = new Set(manifest.pages.map((p) => p.url));
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : e.name.endsWith(".html") ? [full] : [];
    });
  for (const file of walk(PAGES_DIR)) {
    const rel = path.relative(PAGES_DIR, file).replace(/\\/g, "/").replace(/\.html$/, "");
    const url = rel === "index" ? "/" : `/${rel}`;
    if (!listed.has(url) && !NO_TWIN.has(url)) {
      fail(url, "this page has no Markdown twin; add it to scripts/lib/site-content.mjs or to NO_TWIN in this file");
    }
  }
}

function checkHidden() {
  const generated = manifest.files.map((name) => path.join(PUBLIC_DIR, name));
  for (const slug of manifest.hidden) {
    const pattern = hiddenPostPattern(slug);
    if (fs.existsSync(path.join(PUBLIC_DIR, "writing", `${slug}.md`))) {
      fail(slug, "hidden post has a Markdown twin");
    }
    if (fs.existsSync(path.join(PAGES_DIR, "writing", `${slug}.html`))) {
      fail(slug, "hidden post has a built page");
    }
    for (const target of generated) {
      if (fs.existsSync(target) && pattern.test(fs.readFileSync(target, "utf8"))) {
        fail(slug, `hidden post is referenced in ${path.relative(ROOT, target)}`);
      }
    }
  }
}

/** llms-full.txt must be exactly the twins (already compared with their pages). */
function checkLlmsFull() {
  const expected =
    [
      llmsFullHeader(),
      ...manifest.pages
        .filter((p) => !p.stub)
        .map((p) => llmsFullSection({ url: p.url, date: p.date }, readPublic(p.md))),
    ].join(LLMS_FULL_SEPARATOR) + "\n";
  if (readPublic("llms-full.txt") !== expected) {
    fail("llms-full.txt", "is not exactly the header plus every non-placeholder twin; regenerate with npm run mirrors");
  }
}

function checkIndexLinks() {
  for (const name of ["llms.txt", "sitemap-markdown.xml"]) {
    const text = readPublic(name);
    const pattern = new RegExp(`${SITE_URL.replace(/[.]/g, "\\.")}(/[^\\s)<]*\\.(?:md|txt|pdf))`, "g");
    for (const [, target] of text.matchAll(pattern)) {
      if (!fs.existsSync(path.join(PUBLIC_DIR, decodeURIComponent(target)))) {
        fail(name, `links ${target}, which does not exist`);
      }
    }
  }
  const llms = readPublic("llms.txt");
  for (const page of manifest.pages.filter((p) => !p.stub)) {
    if (!llms.includes(`(${abs(page.md)})`)) fail("llms.txt", `does not link ${page.md}`);
  }
}

/** A failed clone of the notes repo empties the Scaling Book; do not deploy that. */
function checkScalingBook() {
  if (!manifest.pages.some((p) => p.kind === "chapter")) {
    fail(
      "Scaling Book",
      "no chapters were synced (did the clone of 0x3ddie/notes fail?). The live site has them; " +
        "rebuild, or set SKIP_MIRROR_VERIFY=1 if removing every chapter is intended"
    );
  }
}

// The words a visitor can read on the home page and the resume back every
// word of the site description's first sentence, which every page's meta
// description and llms.txt repeat. Function words and the name are exempt.
const DESCRIPTION_EXEMPT = new Set([
  "a", "an", "and", "at", "in", "of", "the", "with", "to", "for", "on", "student", "eddie", "chen",
]);
let resumePdfText = null;

function checkDescription() {
  const firstSentence = site.description.split(/\.\s/)[0];
  const visible = new Set(tokens([pageTexts.get("/") || "", resumePdfText || "", readPublic("resume.md")].join(" ")));
  const unsupported = [...new Set(tokens(firstSentence))].filter((t) => !DESCRIPTION_EXEMPT.has(t) && !visible.has(t));
  if (unsupported.length) {
    fail(
      "content/site.json",
      `the description says "${firstSentence}", but no visitor can read these words on the home page or ` +
        `the resume: ${unsupported.join(" ")}. Put the claim on the home page or the resume, or change the description`
    );
  }
}

// --- resume -------------------------------------------------------------------
//
// content/resume.md records the SHA-256 of the PDF it was transcribed from
// (`pdf_sha256` in its frontmatter). A new PDF fails the build until both are
// updated together. When the PDF's text can be read, the words are compared
// too: every PDF word must be in the Markdown, and the Markdown may add only
// its own headings and link labels and the wording listed here.
const RESUME_LABELS = new Set([
  "resume", "canonical", "pdf", "repo", "demo", "app", "links", "website", "projects",
  "writing", "github", "x", "twitter", "portfolio", "open", "source",
  "a", "an", "the", "to", "of", "and", "in", "on", "for", "with", "at", "by",
]);
const RESUME_WORDING = new Set(["wrote"]); // "Wrote a fused Triton attention kernel"
const PDF_LABELS = new Set(["major", "contributions", "portfolio", "github"]);
const RESUME_PDF = path.join(PUBLIC_DIR, "Edward-Chen-Resume.pdf");
let resumeStatus = "";

function checkResume() {
  const page = manifest.pages.find((p) => p.kind === "resume");
  if (!page) return;
  const source = path.join(ROOT, "content", "resume.md");
  const recorded = String(matter(fs.readFileSync(source, "utf8")).data.pdf_sha256 || "");
  const actual = crypto.createHash("sha256").update(fs.readFileSync(RESUME_PDF)).digest("hex");
  if (recorded !== actual) {
    fail(
      "content/resume.md",
      `the resume PDF has changed (sha256 ${actual}, recorded ${recorded || "nothing"}). ` +
        "Update content/resume.md to say what the new PDF says, then set its pdf_sha256 to the new value"
    );
    resumeStatus = "resume PDF changed";
    return;
  }

  let pdf = null;
  try {
    pdf = extractPdfText(RESUME_PDF);
  } catch {
    pdf = null;
  }
  // The Markdown resume leaves out the phone number on purpose (Eddie's
  // decision, 2026-11-23), so phone numbers in the PDF are not compared.
  const PHONE = /\(?\b\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}\b/g;
  const pdfWords = pdf ? countTokens(tokens(pdf.replace(PHONE, " "))) : new Map();
  if (pdfWords.size === 0) {
    notes.push("resume: the PDF's text could not be read; it is the PDF recorded in content/resume.md, so it was not re-compared");
    resumeStatus = "resume PDF unchanged (text not readable, words not compared)";
    return;
  }
  resumePdfText = pdf;
  const withoutUrls = (text) => text.replace(/https?:\/\/\S+/g, " ");
  const mdWords = countTokens(tokens(withoutUrls(twinBody(readPublic(page.md)))));
  const onlyPdf = missing(pdfWords, mdWords).filter((t) => !PDF_LABELS.has(t));
  const onlyMarkdown = missing(mdWords, pdfWords).filter((t) => !RESUME_LABELS.has(t));
  const unexplained = onlyMarkdown.filter((t) => !RESUME_WORDING.has(t));
  if (onlyPdf.length) {
    fail("content/resume.md", `the resume PDF says things the Markdown resume does not: ${[...new Set(onlyPdf)].join(" ")}`);
  }
  if (unexplained.length) {
    fail("content/resume.md", `the Markdown resume says things the PDF does not: ${[...new Set(unexplained)].join(" ")}`);
  }
  const allowed = [...new Set(onlyMarkdown.filter((t) => RESUME_WORDING.has(t)))];
  resumeStatus = allowed.length
    ? `resume matches the PDF except the allowed wording: ${allowed.join(" ")}`
    : "resume matches the PDF";
}

// --- run ------------------------------------------------------------------------

for (const page of manifest.pages) await checkPage(page);
checkEveryPageHasTwin();
checkHidden();
checkLlmsFull();
checkIndexLinks();
checkScalingBook();
checkResume();
checkDescription();

for (const note of notes) console.log(`[verify-mirrors] ${note}`);
if (failures.length === 0) {
  console.log(
    `[verify-mirrors] ${manifest.pages.length} pages match their Markdown twins (words, links, sup/sub); ` +
      `${manifest.hidden.length} hidden post(s) absent; llms-full.txt is the twins; ${resumeStatus}.`
  );
} else {
  for (const f of failures) console.error(`[verify-mirrors] FAIL ${f}`);
  if (/^(1|true)$/i.test(process.env.SKIP_MIRROR_VERIFY || "")) {
    console.error("[verify-mirrors] SKIP_MIRROR_VERIFY is set: continuing despite the failures above.");
  } else {
    console.error(
      `[verify-mirrors] ${failures.length} problem(s). The Markdown twins must say what the pages say. ` +
        "SKIP_MIRROR_VERIFY=1 builds anyway."
    );
    process.exit(1);
  }
}
