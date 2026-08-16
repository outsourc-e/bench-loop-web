# BenchLoop Edge Functions

These server-side functions implement scoped Runner pairing and authenticated run ingestion.

| Function | Caller | Purpose |
|---|---|---|
| `runner-pair-start` | CLI, unauthenticated | Create a ten-minute device and human code pair |
| `runner-pair-approve` | Signed-in browser | Attach the human code to the current builder |
| `runner-pair-token` | CLI, unauthenticated | Atomically exchange an approved device code once |
| `runs` | Paired CLI | Validate the device token and ingest a sanitized v3 receipt |

All four functions have gateway JWT verification disabled because two are intentionally pre-authentication and two use application-level credentials. Approval validates the Supabase user JWT inside the function; run ingestion validates a high-entropy Runner token by SHA-256 hash. Plain Runner tokens are returned once and never stored in Postgres.

Required server environment:

```text
SUPABASE_URL=<provided by Supabase>
SUPABASE_SERVICE_ROLE_KEY=<provided by Supabase Edge Runtime>
BENCHLOOP_SITE_URL=https://bench-loop.com
```

Never expose the service-role key to Vite or the browser. Production should place rate limiting in front of pairing-start and pairing-token and map the stable API routes used by the CLI:

```text
POST /v1/runner/pair/start  → runner-pair-start
POST /v1/runner/pair/token  → runner-pair-token
POST /v1/runs               → runs
```

The browser invokes `runner-pair-approve` through the Supabase client.
