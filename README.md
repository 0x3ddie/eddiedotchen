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

## Generate Sitemap

```bash
npm run sitemap
```

Update the `SITE_URL` in `scripts/generate-sitemap.mjs` with your actual domain before deploying.

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
