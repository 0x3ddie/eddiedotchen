import path from "path";
import fs from "fs";
import { getMdxContent, MaybeContent } from "./mdx";

export interface DeepDive {
  title: string;
  image: string;
  description: string;
  links: {
    label: string;
    href: string;
  }[];
}

export function getDeepDives(): DeepDive[] {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "content", "deep-dives", "index.json"),
      "utf8"
    )
  );
}

export interface Post {
  title: string;
  description: string;
  image: string;
  date: string;
  url: string;
  external: boolean;
  source: string;
}

export function getAllPostData(): Post[] {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "content", "writing", "index.json"),
      "utf8"
    )
  );
}

export function getAllSlugs(): string[] {
  const data = getAllPostData();

  // Only generate dynamic paths for entries that have a real MDX file in
  // content/writing/. Skips internal-route entries (e.g. /writing/scaling-book)
  // which are served by their own static page and would conflict with the
  // [slug].tsx dynamic route at build time.
  const writingDir = path.join(process.cwd(), "content", "writing");
  return data
    .filter((item) => !item.external)
    .filter((item) => {
      const slug = item.url.replace(/^\/writing\//, "");
      return fs.existsSync(path.join(writingDir, `${slug}.mdx`));
    })
    .map((item) => item.url);
}

export async function getPost(slug: string): Promise<MaybeContent<Post>> {
  return getMdxContent<Post>("writing", `${slug}.mdx`);
}
