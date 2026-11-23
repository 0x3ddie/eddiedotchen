import siteData from "../content/site.json";

// Identity facts for the whole site live in content/site.json. The SEO tags,
// the JSON-LD and the generated llms.txt all read them from there, so a
// correction is made once.
export const site = siteData;
export const SITE_URL = site.url.replace(/\/+$/, "");

/** Path part of a router `asPath`: no query, no hash, no trailing slash. */
export function pagePath(asPath: string): string {
  const path = asPath.split(/[?#]/)[0].replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

export function absoluteUrl(path: string): string {
  return SITE_URL + (path === "/" ? "/" : path);
}

// Routes that have a generated Markdown twin (scripts/generate-llm-mirrors.mjs).
const TWIN_ROUTES = new Set([
  "/",
  "/resume",
  "/engineering",
  "/writing",
  "/writing/[slug]",
  "/writing/scaling-book",
  "/writing/scaling-book/[slug]",
  "/reading/[[...slug]]",
]);

/** Path of the Markdown twin for a page. Mirrors scripts/lib/site-content.mjs. */
export function twinPath(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
}

/** Twin for the page being rendered, or null when the route has none. */
export function twinFor(route: string, asPath: string): string | null {
  return TWIN_ROUTES.has(route) ? twinPath(pagePath(asPath)) : null;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * ISO form of the date strings used in frontmatter ("March 28, 2026",
 * "November 2023", "2026-06-04"), or null. Mirrors scripts/lib/site-content.mjs.
 */
export function isoDate(value?: string | null): string | null {
  if (!value) return null;
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

const person = {
  "@type": "Person",
  "@id": `${SITE_URL}/#person`,
  name: site.name,
  alternateName: site.alternateName,
  url: `${SITE_URL}/`,
  email: `mailto:${site.email}`,
  affiliation: {
    "@type": "CollegeOrUniversity",
    name: site.affiliation,
  },
  knowsAbout: site.knowsAbout,
  sameAs: site.sameAs,
};

/** schema.org ProfilePage for the home page. */
export function profileJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${SITE_URL}/`,
    mainEntity: person,
  };
}

/** schema.org Article for a post or a Scaling Book chapter. */
export function articleJsonLd(article: {
  path: string;
  title: string;
  description?: string;
  date?: string;
  image?: string;
}) {
  const url = absoluteUrl(article.path);
  const published = isoDate(article.date);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    ...(article.description ? { description: article.description } : {}),
    ...(published ? { datePublished: published } : {}),
    ...(article.image ? { image: new URL(article.image, `${SITE_URL}/`).href } : {}),
    url,
    mainEntityOfPage: url,
    author: {
      "@type": "Person",
      "@id": person["@id"],
      name: site.name,
      url: `${SITE_URL}/`,
    },
  };
}
