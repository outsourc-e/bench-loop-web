# Ask Loop research bridge

Ask Loop keeps the browser and Cloudflare Worker away from the local Hermes/xAI
OAuth session. The Worker retrieves matching BenchLoop runs from D1, then calls
this small authenticated bridge through Cloudflare Tunnel. The bridge can only
reach the fixed local Hermes Responses endpoint and never returns OAuth tokens.
Conversation threads remain in the browser tab; the Worker and bridge validate
and forward at most four recent user/assistant turn pairs for contextual follow-ups.

## Local run

Prerequisites: Hermes Proxy listening on `127.0.0.1:8645` with xAI OAuth ready,
Node 20+, and a bridge token of at least 32 characters.

```bash
hermes proxy start
HERMES_BRIDGE_TOKEN="$(security find-generic-password -w -s benchloop-hermes-bridge)" \
  node bridge/hermes-bridge.mjs
```

The bridge binds to `127.0.0.1:8789`. Put its Cloudflare Tunnel URL and the same
token into the Worker's `HERMES_BRIDGE_URL` and `HERMES_BRIDGE_TOKEN` secrets.
Never commit either value.

## Production note

The current pilot can use a Quick Tunnel. Before relying on Ask Loop unattended,
map the existing named `benchloop-ask` tunnel to a dedicated hostname and run
Hermes Proxy, this bridge, and `cloudflared` as supervised macOS services.
