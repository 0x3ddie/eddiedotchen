import { serialize } from "next-mdx-remote/serialize";
import path from "path";
import fs from "fs";

// next-mdx-remote derives its JSX runtime from NODE_ENV, overriding
// mdxOptions.development. Match next build without Unix-only shell syntax.
if (process.argv.includes("--production")) {
  process.env.NODE_ENV = "production";
}

async function writing() {
  const metadata = [];
  const basePath = path.join(process.cwd(), "content", "writing");

  // Entries in external.json default to `external: true` (typical case: link
  // to off-site content). To support listing internal-route entries here too
  // (e.g. /writing/scaling-book points at a custom static page), allow each
  // entry to override `external` explicitly.
  const external = JSON.parse(
    fs.readFileSync(path.join(basePath, "external.json"), "utf8")
  ).map((item) => ({ ...item, external: item.external !== false }));
  const postPaths = fs.readdirSync(basePath, "utf8");
  const posts = await Promise.all(
    postPaths
      .filter((fileName) => fileName.includes(".mdx"))
      .map(async (fileName) => {
        const contentPath = path.join(basePath, fileName);
        const fileContents = fs.readFileSync(contentPath, "utf8");
        const source = await serialize(fileContents, {
          parseFrontmatter: true,
          mdxOptions: { development: false },
        });

        return {
          ...source.frontmatter,
          url: "/" + path.posix.join("writing", fileName.split(".")[0]),
          external: false,
        };
      })
  );

  // `hidden: true` in a post's frontmatter keeps the .mdx in the repo but drops
  // it from the index, which is what the listing, routes, and sitemap read.
  metadata.push(...posts.filter((post) => post.hidden !== true));
  metadata.push(...external);
  metadata.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  fs.writeFileSync(
    path.join(basePath, "index.json"),
    JSON.stringify(metadata, undefined, 2)
  );
}

async function books() {
  const basePath = path.join(process.cwd(), "content", "books");

  const bookPaths = fs.readdirSync(basePath, "utf8");
  const books = await Promise.all(
    bookPaths
      .filter((fileName) => fileName.includes(".mdx"))
      .map(async (fileName) => {
        const contentPath = path.join(basePath, fileName);
        const fileContents = fs
          .readFileSync(contentPath, "utf8")
          .split("## My Notes")[0];
        const source = await serialize(fileContents, {
          parseFrontmatter: true,
          mdxOptions: { development: false },
        });

        return {
          ...source.frontmatter,
          slug: "/" + path.posix.join("reading", fileName.split(".")[0]),
          summary: source.compiledSource,
        };
      })
  );

  books.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  fs.writeFileSync(
    path.join(basePath, "index.json"),
    JSON.stringify(books, undefined, 2)
  );
}

async function engineering() {
  const metadata = [];
  const basePath = path.join(process.cwd(), "content", "engineering");

  const external = JSON.parse(
    fs.readFileSync(path.join(basePath, "external.json"), "utf8")
  ).map((item) => ({ ...item, external: true }));
  const postPaths = fs.readdirSync(basePath, "utf8");
  const posts = await Promise.all(
    postPaths
      .filter((fileName) => fileName.includes(".mdx"))
      .map(async (fileName) => {
        const contentPath = path.join(basePath, fileName);
        const fileContents = fs.readFileSync(contentPath, "utf8");
        const source = await serialize(fileContents, {
          parseFrontmatter: true,
          mdxOptions: { development: false },
        });

        return {
          ...source.frontmatter,
          url: "/" + path.posix.join("engineering", fileName.split(".")[0]),
          external: false,
        };
      })
  );

  metadata.push(...posts);
  metadata.push(...external);
  metadata.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  fs.writeFileSync(
    path.join(basePath, "index.json"),
    JSON.stringify(metadata, undefined, 2)
  );
}

async function main() {
  await writing();
  await books();
  await engineering();
}

main();
