import fs from "fs";
import path from "path";

const SITE_URL = "https://eddiechen.xyz";

function getAllBookSlugs() {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "content", "books", "index.json"),
      "utf8"
    )
  );
  return data.map((item) => item.slug);
}

function getAllWritingSlugs() {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "content", "writing", "index.json"),
      "utf8"
    )
  );

  return data.filter((item) => !item.external).map((item) => item.url);
}

function getAllEngineeringSlugs() {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "content", "engineering", "index.json"),
      "utf8"
    )
  );

  return data.filter((item) => !item.external).map((item) => item.url);
}

async function main() {
  const bookSlugs = getAllBookSlugs();
  const writingSlugs = getAllWritingSlugs();
  const engineeringSlugs = getAllEngineeringSlugs();
  const allSlugs = [...bookSlugs, ...writingSlugs, ...engineeringSlugs];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
  </url>
  <url>
    <loc>${SITE_URL}/writing</loc>
  </url>
  <url>
    <loc>${SITE_URL}/engineering</loc>
  </url>
  <url>
    <loc>${SITE_URL}/reading</loc>
  </url>
  <url>
    <loc>${SITE_URL}/resume</loc>
  </url>${allSlugs
    .map((slug) => {
      return `
  <url>
    <loc>${`${SITE_URL}${slug}`}</loc>
  </url>`;
    })
    .join("")}
</urlset>`;

  if (fs.existsSync("public/sitemap.xml")) {
    fs.unlinkSync("public/sitemap.xml");
  }

  fs.writeFileSync("public/sitemap.xml", sitemap);
}

main();
