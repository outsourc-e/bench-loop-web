# Deploying bench-loop.com

The React application is static at the edge; community data, accounts, RLS, and Realtime are provided by Supabase.

## Required public environment

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SITE_URL=https://bench-loop.com
```

These are browser-safe values. Never expose a Supabase secret or `service_role` key through Vite.

## Backend setup

1. Create a dedicated Supabase project.
2. Apply the versioned migrations in `../supabase/migrations/`.
3. In Supabase Auth, enable GitHub and enter the GitHub OAuth client ID and secret.
4. In the GitHub OAuth app, set the callback URL shown by the Supabase GitHub provider screen.
5. Add `https://bench-loop.com/**`, `https://www.bench-loop.com/**`, and the local development URL to the Supabase redirect allow list.
6. Run the Supabase security and performance advisors and resolve all production findings.

The application uses RLS-protected browser queries. Runner tokens will be issued by a separate server-side pairing flow; they must never be generated or stored in frontend code.

## Build

```bash
npm ci
npm run check
```

Deploy the generated `dist/` directory. The existing `vercel.json` includes SPA route fallback behavior.

## Vercel

- Root directory: `site`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Add the three public environment variables above to Preview and Production.
- Attach `bench-loop.com` and `www.bench-loop.com`.

## Cloudflare Pages

- Root directory: `site`
- Build command: `npm run build`
- Output directory: `dist`
- Add the three public environment variables above.
- Configure SPA fallback and attach the custom domains.

## Release check

- GitHub login returns to the same origin.
- A new user receives a profile row.
- Public feeds load while signed out.
- Private rows remain invisible to other users.
- Post, upvote, comment, follow, and sign-out work.
- `/posts/:id`, `/u/:handle`, and other deep links survive a hard refresh.
- No secret keys appear in built assets or deployment logs.
