/** @type {import('next').NextConfig} */

const withMDX = require("@next/mdx")({
  extension: /\.mdx?$/,
  options: {
    // If you use remark-gfm, you'll need to use next.config.mjs
    // as the package is ESM only
    // https://github.com/remarkjs/remark-gfm#install
    remarkPlugins: [],
    rehypePlugins: [],
    // If you use `MDXProvider`, uncomment the following line.
    // providerImportSource: "@mdx-js/react",
  },
});

const SITE_URL = require("./content/site.json").url.replace(/\/+$/, "");

// Every page has a generated Markdown twin at <page>.md (the home page is
// /index.md); see scripts/generate-llm-mirrors.mjs. A request for a page that
// sends `Accept: text/markdown` gets the twin: same content, different format.
// Nothing here looks at the user agent.
//
// The routes are the exact pages the generator wrote (content/llm-mirrors.json,
// generated before `next build`), so a 404 never advertises a twin that does
// not exist. Without that file, the patterns below are used instead.
// `twinSource` is the twin's own URL as a route pattern.
const PATTERN_ROUTES = [
  { source: "/", twin: "/index.md", twinSource: "/index.md", canonical: "/" },
  {
    source: "/:section(writing|reading|engineering|resume)",
    twin: "/:section.md",
    twinSource: "/:section(writing|reading|engineering|resume).md",
    canonical: "/:section",
  },
  {
    source: "/:section(writing|reading)/:slug([^/.]+)",
    twin: "/:section/:slug.md",
    twinSource: "/:section(writing|reading)/:slug([^/.]+).md",
    canonical: "/:section/:slug",
  },
  {
    source: "/writing/scaling-book/:slug([^/.]+)",
    twin: "/writing/scaling-book/:slug.md",
    twinSource: "/writing/scaling-book/:slug([^/.]+).md",
    canonical: "/writing/scaling-book/:slug",
  },
];

// A literal path as a route pattern (path-to-regexp treats these as syntax).
const literal = (path) => path.replace(/[:()*+?{}\\]/g, "\\$&");

function twinRoutes() {
  let pages;
  try {
    pages = require("./content/llm-mirrors.json").pages;
  } catch {
    return PATTERN_ROUTES;
  }
  return pages.map(({ url, md }) => ({
    source: literal(url),
    twin: md,
    twinSource: literal(md),
    canonical: url,
  }));
}

const TWIN_ROUTES = twinRoutes();

const WANTS_MARKDOWN = [
  { type: "header", key: "accept", value: "(.*)text/markdown(.*)" },
];

// One Link header per response: the canonical page, the llms.txt index that
// describes it, and (on a page) its Markdown twin. llmstxt.org recommends
// rel="alternate" type="text/markdown" and rel="describedby" for discovery.
const linkHeader = ({ canonical, twin }) => ({
  key: "Link",
  value: [
    `<${SITE_URL}${canonical}>; rel="canonical"`,
    twin && `<${SITE_URL}${twin}>; rel="alternate"; type="text/markdown"`,
    `<${SITE_URL}/llms.txt>; rel="describedby"`,
  ]
    .filter(Boolean)
    .join(", "),
});

module.exports = withMDX({
  async redirects() {
    return [
      {
        source: "/books/:slug*",
        destination: "/reading/:slug*",
        permanent: true,
      },
      // The projects mirror used to live here; the twin of /engineering replaced it.
      {
        source: "/projects.md",
        destination: "/engineering.md",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: TWIN_ROUTES.map(({ source, twin }) => ({
        source,
        has: WANTS_MARKDOWN,
        destination: twin,
      })),
    };
  },
  async headers() {
    return [
      // A page answers with HTML or Markdown depending on Accept, so caches
      // must key on it. Either way the page URL is the canonical one.
      ...TWIN_ROUTES.map(({ source, canonical, twin }) => ({
        source,
        headers: [{ key: "Vary", value: "Accept" }, linkHeader({ canonical, twin })],
      })),
      // The twins point search engines back at the page they mirror, so the
      // Markdown copy is never treated as a competing duplicate.
      ...TWIN_ROUTES.map(({ twinSource, canonical }) => ({
        source: twinSource,
        headers: [linkHeader({ canonical })],
      })),
    ];
  },
  // Append the default value with md extensions
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
});
