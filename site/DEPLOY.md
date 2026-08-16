# Deploying bench-loop.com on Cloudflare

BenchLoop uses a Cloudflare-native stack:

- Pages serves the Vite/React application at `bench-loop.com`.
- `bench-loop-api` is a Worker on `api.bench-loop.com`.
- D1 stores benchmark receipts, accounts, profiles, rigs, social activity, Runner devices, and Ask Loop threads.
- Better Auth runs inside the Worker and supports GitHub and X OAuth.
- Existing Ask Loop research continues through the Worker’s private Hermes bridge secrets.

## Browser environment

The only site build variable is public:

```text
VITE_API_URL=https://api.bench-loop.com
```

No database or OAuth secret belongs in a `VITE_*` variable.

## Worker setup

From `worker/`:

```bash
npm ci
npm run types
npm run typecheck
npm run db:migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET --config wrangler.jsonc
npx wrangler secret put GITHUB_CLIENT_ID --config wrangler.jsonc
npx wrangler secret put GITHUB_CLIENT_SECRET --config wrangler.jsonc
npx wrangler secret put TWITTER_CLIENT_ID --config wrangler.jsonc
npx wrangler secret put TWITTER_CLIENT_SECRET --config wrangler.jsonc
npm run deploy
```

The existing `bench-loop` D1 binding and custom API domain are declared in `worker/wrangler.jsonc`. Migrations are additive and retain the existing `runs` rows.

OAuth callbacks:

- GitHub: `https://api.bench-loop.com/api/auth/callback/github`
- X: `https://api.bench-loop.com/api/auth/callback/twitter`

Register `https://bench-loop.com` as the application/homepage URL in each provider. X Premium is not an OAuth developer credential; the X app still needs its own client ID and secret.

## Site build and deploy

From `site/`:

```bash
npm ci
npm run check
npx wrangler pages deploy dist --project-name=bench-loop --branch=main
```

Cloudflare Pages uses `public/_redirects` for SPA deep-link fallback.

## Release check

- `/health` reports `accounts: true`.
- `/account/config` reports the intended GitHub/X providers as enabled.
- GitHub and X return to the same BenchLoop page after sign-in.
- A new OAuth user receives a D1 profile automatically.
- Profile edits, rigs, posts, upvotes, comments, follows, and sign-out work.
- Ask Loop keeps a multi-turn thread and syncs it after sign-in.
- Runner start → browser approval → one-time exchange works, and the device can be revoked.
- Public feeds work signed out; account writes remain owner-scoped.
- `/posts/:id`, `/u/:handle`, `/settings`, and `/connect` survive a hard refresh.
- Built assets and deployment logs contain no secrets.
