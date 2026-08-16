# BenchLoop Web

BenchLoop is the local AI intelligence network: ask what will work on your hardware, reproduce an exact recipe with the local runner, publish a structured benchmark receipt, and learn from the builders reproducing it.

The product loop is:

```text
Ask → Recipe → Runner → Verified run → Community signal → Better Ask
```

## Surfaces

| Directory | Role |
|---|---|
| `site/` | Public React app: discovery, profiles, discussions, recipes, runs, and leaderboards |
| `worker/` | Cloudflare Worker, D1 migrations, Better Auth, Ask Loop, community APIs, and Runner pairing |
| `api/`, `ui/` | Existing local runner control plane; preserved while the public network is built |

The benchmark engine and CLI live in the separate [`outsourc-e/bench-loop`](https://github.com/outsourc-e/bench-loop) repository.

## Public site development

```bash
cd site
npm install
cp .env.example .env.local
npm run dev
```

The site talks to `https://api.bench-loop.com` by default. Set `VITE_API_URL` only when developing against a local Worker. Public discovery falls back to the polished launch dataset while a new D1 community has no posts.

OAuth, D1, and Hermes credentials stay in Worker secrets. Never place a secret in a `VITE_*` variable.

## Verification

```bash
cd site
npm run check
npm audit --audit-level=moderate
```

The database foundation lives in `worker/migrations/`. Apply it with Wrangler, then deploy the Worker and Cloudflare Pages site as described in `site/DEPLOY.md`.

## Product direction

See [`docs/REVAMP-VISION.md`](docs/REVAMP-VISION.md) for the product thesis, information architecture, trust model, and milestones.
