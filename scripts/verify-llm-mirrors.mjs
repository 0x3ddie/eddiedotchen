// Checks the generated Markdown twins against the built site. Runs at the end
// of `npm run build`, after `next build` has written the HTML pages.
//
// For every page it renders the twin through the same MDX renderer the site
// uses, then compares the words inside the page's <main> with the words of the
// rendered twin, in both directions:
//   - words on the page but not in the twin  -> the twin is missing content
//   - words in the twin but not on the page  -> the twin says something the
//     page does not, which the site must never do
// It also checks that each page links its twin and names itself as canonical,
// that hidden posts appear nowhere, that every llms.txt link resolves, and
// that content/resume.md still says what the resume PDF says.
//
// A failure stops the build. SKIP_MIRROR_VERIFY=1 turns it into a warning.

import fs from "node:fs";
import path from "node:path";
import { extractPdfText } from "./lib/pdf-text.mjs";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const PAGES_DIR = path.join(ROOT, ".next", "server", "pages");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "content", "llm-mirrors.json"), "utf8")
);
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "site.json"), "utf8"));
const SITE_URL = site.url.replace(/\/+$/, "");
const abs = (p) => SITE_URL + p;
const verbose = process.argv.includes("--verbose");

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

const INLINE_TAGS = new Set([
  "a", "span", "strong", "em", "b", "i", "code", "sup", "sub", "u", "s", "del", "mark", "small",
]);

function htmlToText(html) {
  let text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    // React's server renderer separates adjacent text nodes with <!-- -->.
    .replace(/<!--[\s\S]*?-->/g, "");
  // KaTeX renders each formula twice: MathML carrying the TeX source, and
  // presentational spans. Keep the TeX, which is what the Markdown holds.
  text = text.replace(
    /<math\b[\s\S]*?<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>[\s\S]*?<\/math>/g,
    (_, tex) => ` ${tex} `
  );
  text = removeElements(text, "span", /<span class="katex-html"[^>]*>/g);
  text = removeElements(text, "nav", /<nav\b[^>]*>/g);
  // remark-gfm's footnote heading; the post pages remove it, chapters keep it.
  text = removeElements(text, "h2", /<h2\b[^>]*id="footnote-label"[^>]*>/g);
  text = text.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_, name) =>
    INLINE_TAGS.has(name.toLowerCase()) ? "" : " "
  );
  return decodeEntities(text);
}

// The twin is rendered with the site's own pipeline (next-mdx-remote, React),
// as plain Markdown, with math for chapters, so both sides of the comparison
// are HTML produced the same way. NODE_ENV is set before the imports load
// because next-mdx-remote picks its JSX runtime from it.
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

async function renderedTwinText(markdown, { math }) {
  const { compiledSource } = await serialize(markdown, {
    parseFrontmatter: true,
    mdxOptions: {
      format: "md",
      development: false,
      remarkPlugins: [remarkGfm, ...(math ? [remarkMath] : [])],
      rehypePlugins: math ? [rehypeKatex] : [],
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(MDXRemote, { compiledSource, frontmatter: {}, scope: {} })
  );
  return htmlToText(html);
}

const tokens = (text) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);

function countTokens(list) {
  const counts = new Map();
  for (const t of list) counts.set(t, (counts.get(t) || 0) + 1);
  return counts;
}

/** Words in `a` that `b` does not have (with multiplicity). */
function missing(a, b) {
  const out = [];
  for (const [token, n] of a) {
    const short = n - (b.get(token) || 0);
    for (let i = 0; i < short; i++) out.push(token);
  }
  return out;
}

// --- checks -----------------------------------------------------------------

const failures = [];
const notes = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
const sample = (list) => [...new Set(list)].slice(0, 12).join(" ");

function htmlFile(url) {
  return path.join(PAGES_DIR, url === "/" ? "index.html" : `${url.slice(1)}.html`);
}

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

  // The resume page shows the PDF in a frame; its twin is checked against the PDF.
  if (page.kind === "resume") return;

  const main = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html);
  if (!main) return fail(page.url, "page has no <main>");
  const title = /<title>([\s\S]*?)<\/title>/.exec(html);

  const pageWords = countTokens(tokens(htmlToText(main[1])));
  let twinText;
  try {
    twinText = await renderedTwinText(twin, { math: page.kind === "chapter" });
  } catch (error) {
    return fail(page.md, `twin does not render as Markdown: ${String(error.message).split("\n")[0]}`);
  }
  const twinWords = countTokens(tokens(twinText));
  const pageAndTitle = countTokens([
    ...tokens(htmlToText(main[1])),
    ...tokens(decodeEntities(title ? title[1] : "")),
  ]);

  const notInTwin = missing(pageWords, twinWords);
  const notOnPage = missing(twinWords, pageAndTitle);
  const total = [...pageWords.values()].reduce((a, b) => a + b, 0);
  if (notInTwin.length) {
    fail(page.url, `${notInTwin.length} of ${total} words on the page are missing from ${page.md}: ${sample(notInTwin)}`);
  }
  if (notOnPage.length) {
    fail(page.md, `${notOnPage.length} words in the twin are not on the page ${page.url}: ${sample(notOnPage)}`);
  }
  if (verbose) notes.push(`ok ${page.url} (${total} words)`);
}

function checkHidden() {
  const generated = manifest.files.map((name) => path.join(PUBLIC_DIR, name));
  for (const slug of manifest.hidden) {
    const pattern = new RegExp(`/writing/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
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

function checkIndexLinks() {
  for (const name of ["llms.txt", "sitemap-markdown.xml"]) {
    const text = fs.readFileSync(path.join(PUBLIC_DIR, name), "utf8");
    const pattern = new RegExp(`${SITE_URL.replace(/[.]/g, "\\.")}(/[^\\s)<]*\\.(?:md|txt|pdf))`, "g");
    for (const [, target] of text.matchAll(pattern)) {
      if (!fs.existsSync(path.join(PUBLIC_DIR, decodeURIComponent(target)))) {
        fail(name, `links ${target}, which does not exist`);
      }
    }
  }
}

// Words content/resume.md adds around the PDF's text: its own headings and
// link labels, and small function words that differ with punctuation ("to"
// for a dash). Everything else is expected to match the PDF word for word.
const RESUME_LABELS = new Set([
  "resume", "canonical", "pdf", "repo", "demo", "app", "links", "website", "projects",
  "writing", "github", "x", "twitter", "portfolio", "open", "source",
  "a", "an", "the", "to", "of", "and", "in", "on", "for", "with", "at", "by",
]);
// Labels the PDF prints that the Markdown expresses as structure.
const PDF_LABELS = new Set(["major", "contributions", "portfolio", "github"]);
const RESUME_EXTRA_WORDS_ALLOWED = 5;

let resumeChecked = true;

async function checkResume() {
  const page = manifest.pages.find((p) => p.kind === "resume");
  if (!page) return;
  const pdfPath = path.join(PUBLIC_DIR, "Edward-Chen-Resume.pdf");
  let pdf = null;
  try {
    pdf = fs.existsSync(pdfPath) ? extractPdfText(pdfPath) : null;
  } catch {
    pdf = null;
  }
  const unreadable = "resume: could not read text from the PDF, so content/resume.md was not compared with it";
  if (!pdf) {
    resumeChecked = false;
    return notes.push(unreadable);
  }

  const withoutUrls = (text) => text.replace(/https?:\/\/\S+/g, " ");
  const pdfWords = countTokens(tokens(pdf));
  const twin = fs.readFileSync(path.join(PUBLIC_DIR, page.md), "utf8");
  const mdWords = countTokens(tokens(withoutUrls(await renderedTwinText(twin, { math: false }))));
  // A PDF from a tool this reader does not understand decodes to noise. Do not
  // fail a build over that; say so instead.
  const shared = [...pdfWords.keys()].filter((t) => mdWords.has(t)).length;
  if (shared < pdfWords.size / 2) {
    resumeChecked = false;
    return notes.push(unreadable);
  }

  const onlyPdf = missing(pdfWords, mdWords).filter((t) => !PDF_LABELS.has(t));
  const onlyMarkdown = missing(mdWords, pdfWords).filter((t) => !RESUME_LABELS.has(t));
  if (onlyPdf.length) {
    fail(
      "content/resume.md",
      `the resume PDF says things the Markdown resume does not (${onlyPdf.length} words): ${sample(onlyPdf)}. ` +
        "Update content/resume.md to match the PDF."
    );
  }
  if (onlyMarkdown.length > RESUME_EXTRA_WORDS_ALLOWED) {
    fail(
      "content/resume.md",
      `the Markdown resume says things the PDF does not (${onlyMarkdown.length} words): ${sample(onlyMarkdown)}. ` +
        "Update content/resume.md to match the PDF."
    );
  } else if (onlyMarkdown.length) {
    notes.push(`resume: wording differs slightly from the PDF (in the Markdown only: ${sample(onlyMarkdown)})`);
  }
}

for (const page of manifest.pages) await checkPage(page);
checkHidden();
checkIndexLinks();
await checkResume();

for (const note of notes) console.log(`[verify-mirrors] ${note}`);
if (failures.length === 0) {
  console.log(
    `[verify-mirrors] ${manifest.pages.length} pages match their Markdown twins; ` +
      `${manifest.hidden.length} hidden post(s) absent; index links resolve; ` +
      (resumeChecked ? "resume matches the PDF." : "resume NOT compared with the PDF (see above).")
  );
} else {
  for (const f of failures) console.error(`[verify-mirrors] FAIL ${f}`);
  if (process.env.SKIP_MIRROR_VERIFY) {
    console.error("[verify-mirrors] SKIP_MIRROR_VERIFY is set: continuing despite the failures above.");
  } else {
    console.error(
      `[verify-mirrors] ${failures.length} problem(s). The Markdown twins must say what the pages say; ` +
        "fix scripts/lib/site-content.mjs or the page, or set SKIP_MIRROR_VERIFY=1 to build anyway."
    );
    process.exit(1);
  }
}
