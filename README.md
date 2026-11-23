# Eddie Chen's Personal Website

Personal website built with Next.js, Chakra UI, and MDX.

## Features

- **Reading** - Book reviews with an interactive 3D bookshelf
- **Writing** - Blog posts in MDX format
- **Projects** - Showcase of my engineering projects
- **Resume** - PDF resume viewer

## Getting Started

```bash
# Install dependencies
npm install

# Generate content indexes
npm run generate

# Start development server
npm run dev
```

The site will be available at [http://localhost:3000](http://localhost:3000).

## Adding Content

### Books
Add book reviews as MDX files in `content/books/`. Cover images go in `public/reading/`.

### Writing
Add blog posts as MDX files in `content/writing/`.

### Projects
Edit `content/engineering/external.json` to update the project list.

### Site description and links
Edit `content/site.json`. It feeds the page metadata, the JSON-LD and `llms.txt`.

### Scaling Book
Chapters are sourced from the [`0x3ddie/notes`](https://github.com/0x3ddie/notes) repo at `One/Scaling Book/*.md`. Only files with `published: true` in their frontmatter are picked up.

Frontmatter convention for each chapter:

```yaml
---
title: "Hardware-Aware LLM Inference & Arithmetic Intensity"
description: "(optional) one-line summary"
date: "(optional) 2026-06-04"
order: 1                # (optional) integer; defaults to chapter number from filename
published: true         # required to render
---
```

Chapters are compiled as plain Markdown with math (`format: "md"` in `lib/scaling-book.ts`), not MDX, so braces such as `TPU{0, 0}` render as written. Raw HTML in a chapter is dropped, as Markdown renderers without an HTML sanitizer do.

The sync runs as part of `npm run generate` (so on every Vercel build) via `scripts/sync-scaling-book.mjs`. To trigger a Vercel rebuild when you push to the `notes` repo, create a [Deploy Hook](https://vercel.com/docs/deployments/deploy-hooks) in the Vercel dashboard for this project and POST to it from a GitHub Action in `notes`. Minimal action:

```yaml
# .github/workflows/trigger-website-rebuild.yml in 0x3ddie/notes
on:
  push:
    branches: [main]
    paths: ["One/Scaling Book/**"]
jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST "${{ secrets.WEBSITE_DEPLOY_HOOK_URL }}"
```

Store the hook URL as a repo secret named `WEBSITE_DEPLOY_HOOK_URL` in `notes`.

## Build

```bash
npm run build
npm run start
```

## Markdown twins, llms.txt, robots.txt, sitemaps

Every page also exists as Markdown at the same URL plus `.md` (the home page is `/index.md`), so AI crawlers and assistants can read the site without parsing the HTML. `scripts/generate-llm-mirrors.mjs` builds all of it into `public/` from the same sources the pages render from:

| Output | Built from |
| --- | --- |
| `/index.md` | `pages/index.mdx` |
| `/writing.md`, `/writing/<slug>.md` | `content/writing/*.mdx` (posts with `hidden: true` are left out everywhere) |
| `/writing/scaling-book.md`, `/writing/scaling-book/<slug>.md` | the synced Scaling Book chapters |
| `/reading.md`, `/reading/<slug>.md` | `content/books/*.mdx` |
| `/engineering.md` | `content/engineering/external.json` |
| `/resume.md` | `content/resume.md` (the text of the resume PDF; see below) |
| `/llms.txt`, `/llms-full.txt` | an index of the twins, and every page with real content in one file |
| `/robots.txt` | `lib/ai-crawlers.json` (the crawlers named as allowed) |
| `/sitemap.xml`, `/sitemap-markdown.xml` | the list of pages and of twins |

None of these files is committed or edited by hand; they are gitignored and regenerated on every `npm run dev` and `npm run build`. Under `npm run dev` a problem (a link to a hidden post, a post that does not compile) is printed as a warning and the dev server starts; `npm run build` stops on it. To regenerate without building:

```bash
npm run generate && npm run mirrors
```

Rules the generator keeps:

- The twin of a post, chapter or book note is its source file, parsed with the same MDX parser as the page, with only what the page does not show removed: `{...}` expressions and comments, imports, and (in chapters) raw HTML. Wrapper tags such as `<span>` lose their tags and keep their text.
- A twin says what its page says, nothing more. There is no content for crawlers only, and nothing is served by user agent. A page returns its twin when the request sends `Accept: text/markdown` (see `next.config.js`); that is the same content in another format.
- Identity facts (name, one-line description, email, links) live in `content/site.json`. The SEO tags, the JSON-LD and `llms.txt` all read them from there.
- Pages whose body is a placeholder (under 200 characters, such as an empty chapter) still get a twin but are left out of `llms.txt` and `llms-full.txt`.

`npm run build` ends with `npm run verify:mirrors`, which renders each twin through the site's own MDX renderer and compares the words in each built page's `<main>` with it in both directions, checks the canonical and Markdown-alternate links, checks that hidden posts appear nowhere, and fails the build on any difference. If you add text to a page template, add it to `scripts/lib/site-content.mjs` too. `SKIP_MIRROR_VERIFY=1 npm run build` turns the failure into a warning.

### Resume

The resume PDF (`public/Edward-Chen-Resume.pdf`) is exported from a document outside this repo, so its text lives a second time in `content/resume.md`. When you replace the PDF, update `content/resume.md` in the same commit; the build fails if the PDF says something the Markdown does not.

### Seeing which crawlers visit

`middleware.ts` writes one JSON line (`"msg":"crawler_request"`) for each request from a crawler named in `lib/ai-crawlers.json`, from other self-declared bots, and from requests that claim to be a browser but do not behave like one. Ordinary browser visits are not recorded, and the middleware never changes a response.

- The lines go to Vercel's runtime logs, which the Hobby plan keeps for one hour.
- Set `NEXT_PUBLIC_POSTHOG_API_KEY` in the Vercel project and the same event is also sent to PostHog as `crawler_request`, which keeps it. Break it down by `bot`, `category`, `path` and `markdown`.
- Set `AI_CRAWLER_LOG=off` to turn all of it off.

`lib/ai-crawlers.json` records each crawler's user-agent token, operator, purpose, documentation page and published IP ranges, with the date they were checked. A user agent is a claim, not proof: check a declared bot's `ip` against the operator's `ipRanges` before trusting a surprising number.

### Citation check

`npm run citation-check` lists questions someone might ask an assistant where this site's work should come up. `npm run citation-check -- new` creates a folder for a run; paste each assistant's answer into it, then `npm run citation-check -- score` scores the run and compares it with the previous one. It calls no APIs. Each run's `summary.md` is committed in `citation-check/`; the pasted answers are gitignored because they quote other people's pages.

## Disk space preflight

`npm run dev` and `npm run build` run `scripts/preflight.mjs` first via the `predev` / `prebuild` lifecycle hooks. It aborts if free disk space drops below 3 GiB and warns below 20 GiB. Skipped automatically on Vercel and CI. To bypass locally for one run:

```bash
SKIP_PREFLIGHT=1 npm run dev
```

Why this exists: at low disk, kernel writes can fail mid-operation and leave `node_modules/` and `.git/objects/` corrupt. We have hit this twice — see the recovery procedure below.

## Recovery from broken `.git/`

Symptoms include `git fsck` reporting missing blobs/trees, `git commit` failing with "invalid object", or any git command crashing with `bus error`. Usually caused by the disk filling up while git was mid-write.

Your worktree is fine. The remote has all your pushed history. Recover by replacing the local object store:

```bash
# 1. Move the broken .git/ aside (do not delete; useful if anything goes wrong).
mv .git ".git.broken-$(date +%Y%m%d-%H%M%S)"

# 2. Clone the repo fresh into a temp dir and move its .git into place.
git clone https://github.com/0x3ddie/eddiedotchen.git /tmp/restore
mv /tmp/restore/.git ./.git
rm -rf /tmp/restore

# 3. Verify and re-stage anything that was uncommitted.
git fsck
git status
```

The `.git.broken-*/` directories are gitignored. Delete them once recovery is confirmed to free up space. Anything you had not pushed before the corruption is preserved in the worktree and shows up as uncommitted after recovery.
