import path from "path";
import fs from "fs";
import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Content, MaybeContent } from "./mdx";

export interface Chapter {
  slug: string;
  title: string;
  description: string;
  date: string;
  order: number;
}

const CONTENT_DIR = path.join(process.cwd(), "content", "writing", "scaling-book");

export function getChapterManifest(): Chapter[] {
  const manifestPath = path.join(CONTENT_DIR, "index.json");
  if (!fs.existsSync(manifestPath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function getChapterSlugs(): string[] {
  return getChapterManifest().map((c) => c.slug);
}

// Scaling Book chapters are math-heavy (LaTeX via $...$ and $$...$$), so this
// serializer uses remark-math + rehype-katex. Other writing posts use `$` for
// currency, so we deliberately scope KaTeX to this route only via this fn.
export async function getChapter(slug: string): Promise<MaybeContent<Chapter>> {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const source = await serialize(content, {
    parseFrontmatter: true,
    mdxOptions: {
      development: false,
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeKatex],
    },
  });

  return {
    metadata: source.frontmatter as unknown as Chapter,
    source: source.compiledSource,
  };
}
