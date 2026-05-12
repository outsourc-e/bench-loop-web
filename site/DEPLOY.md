# Deploying benchloop.com

This site is fully static. Anywhere that serves static files works.

## TL;DR

```bash
# 1. Export latest local runs into the public leaderboard JSON
node scripts/export-leaderboard.mjs

# 2. Build the site
npm run build

# 3. Deploy the dist/ folder to your static host
```

## Recommended hosts

### Option A — Cloudflare Pages (recommended)

- Push this repo to GitHub.
- In Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
- Pick the repo, set the **root** to `bench-loop-web/site`.
- **Build command:** `npm run build`
- **Build output:** `dist`
- **Environment variables:** none needed.
- Once green, add the custom domain `benchloop.com` (and `www.benchloop.com`) under the project's **Custom domains** tab. Cloudflare handles DNS + TLS automatically.

### Option B — Vercel

- `vercel link` inside `bench-loop-web/site/`
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Add `benchloop.com` to **Domains**, point the apex `A` record at Vercel's IPs and `www` CNAME at `cname.vercel-dns.com`.

### Option C — Fly.io static site

```bash
flyctl launch --no-deploy
# pick a name, no DB, no http checks
flyctl deploy
```
Then add `benchloop.com` via `flyctl certs create benchloop.com`.

## DNS records

Whichever host you pick, you'll need:

```
benchloop.com.        A      <host IPs>
www.benchloop.com.    CNAME  <host CNAME target>
```

For Cloudflare Pages the apex can be a flattened `CNAME` to `<project>.pages.dev`.

## CI: keep the leaderboard fresh

Add a GitHub Action like `.github/workflows/refresh-leaderboard.yml` that:

1. Pulls the latest `~/.bench-loop/runs/` artifact (or pulls submitted PRs).
2. Runs `node scripts/export-leaderboard.mjs`.
3. Commits the regenerated `public/data/leaderboard.json`.

Cloudflare Pages will redeploy on every commit.

## Image assets to add before launch

- `public/og-image.png` — 1200×630 social card (Open Graph)
- `public/favicon.ico` — already have favicon.svg, add ICO for legacy
- `public/apple-touch-icon.png` — 180×180

The current `<head>` already references all three; they'll just 404 quietly until they exist.
