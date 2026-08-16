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
| `supabase/` | Versioned Postgres schema, RLS policies, Auth, and Realtime configuration |
| `api/`, `ui/` | Existing local runner control plane; preserved while the public network is built |
| `worker/` | Existing hosted leaderboard ingestion path |

The benchmark engine and CLI live in the separate [`outsourc-e/bench-loop`](https://github.com/outsourc-e/bench-loop) repository.

## Public site development

```bash
cd site
npm install
cp .env.example .env.local
npm run dev
```

Without Supabase environment variables, the app deliberately runs in demo mode with the polished launch dataset. With a configured backend it uses live profiles, posts, reactions, comments, follows, and Realtime discussion updates.

Only a Supabase publishable key belongs in the browser. Never place a secret or `service_role` key in a `VITE_*` variable.

## Verification

```bash
cd site
npm run check
npm audit --audit-level=moderate
```

The database foundation lives in `supabase/migrations/`. Apply it to a dedicated Supabase project, then run the Supabase security and performance advisors before launch.

## Product direction

See [`docs/REVAMP-VISION.md`](docs/REVAMP-VISION.md) for the product thesis, information architecture, trust model, and milestones.
