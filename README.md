# BenchLoop Web

The web surface for [BenchLoop](https://benchloop.com) — a local-first benchmark suite for LLM models that scores **quality, speed, and reliability** across six fixed task suites (`speed`, `toolcall`, `coding`, `dataextract`, `instructfollow`, `reasonmath`).

Pick a model on any reachable endpoint (Ollama, LM Studio, Osaurus, vLLM, oMLX, Jan, or any OpenAI-compatible server), pick the suites, hit Run, watch live progress, then compare results in the leaderboard.

## Architecture

```
bench-loop-web/
  api/    FastAPI app (uvicorn) wrapping the bench-loop runner
  ui/     React + Vite frontend
```

The API delegates to `bench-loop/` (sibling repo) for the actual benchmark logic. Runs are persisted to `~/.bench-loop/runs/` so they survive restarts and show up in the leaderboard from disk.

## Quick start (dev)

Two long-running processes:

```bash
# 1. API (port 8877)
cd bench-loop-web/api
PYTHONPATH=/Users/aurora/.ocplatform/workspace/bench-loop \
BENCH_LOOP_DIR=/Users/aurora/.ocplatform/workspace/bench-loop \
  /Users/aurora/.ocplatform/workspace/bench-loop/.venv/bin/python \
  -m uvicorn main:app --host 127.0.0.1 --port 8877 --app-dir .

# 2. UI (port 5180)
cd bench-loop-web/ui
npm install
npx vite --host 127.0.0.1 --port 5180
```

Open <http://127.0.0.1:5180/>.

## Pages

| Path | Purpose |
|---|---|
| `/` `/models` | Auto-detect local providers, browse model catalog, jump to benchmark |
| `/chat` | Quick chat against any reachable model |
| `/benchmark` | Pick model + suites + harness, run with live progress |
| `/leaderboard` | Best run per model+harness, rank by overall/quality/speed/tok-s/efficiency. Click row for detail, hit Compare per row |
| `/runs/:runId` | Full per-suite scores, speed metrics, machine info, raw JSON |
| `/compare?a=&b=` | Two runs side-by-side with deltas across every metric |
| `/stacks` | Stack-oriented context-window leaderboard |

## API endpoints

| Route | What |
|---|---|
| `GET  /api/health` | Liveness |
| `GET  /api/hardware` | Local machine info (CPU, GPU, memory) |
| `GET  /api/models?endpoint=...` | List models. If endpoint omitted, auto-probe localhost for Ollama (11434), LM Studio (1234), oMLX/Osaurus (8000), Jan (1337), vLLM (8080) |
| `GET  /api/models/preflight?endpoint=...&model=...` | Verify a model can actually load |
| `GET  /api/models/search-hf?q=&limit=` | Search Hugging Face |
| `GET  /api/models/hf-details?repo=` | HF repo metadata |
| `POST /api/models/pull` | Trigger a model pull |
| `GET  /api/models/pull/active` | List in-flight pulls |
| `GET  /api/models/pull/{id}/stream` | SSE for pull progress |
| `POST /api/benchmark/run` | Start a benchmark. Body: `{model, endpoint, provider, suites[], harness}` |
| `GET  /api/benchmark/runs` | List persisted runs with v2 speed-score recompute |
| `GET  /api/benchmark/runs/{runId}` | Run detail (active or persisted) |
| `GET  /api/benchmark/stream/{runId}` | SSE for live progress |
| `POST /api/chat/generate` | Passthrough chat completion |

## Providers

Provider type is auto-detected per model and passed to the runner:

- `ollama` — Ollama's `/api/chat` (default for `http://localhost:11434` and any tunnelled Ollama)
- `openai_compat` — Any OpenAI-compatible `/v1/chat/completions`: LM Studio, vLLM, Osaurus/MLX, Jan, oMLX, hosted endpoints

The UI's BenchmarkTab picks the correct provider based on the chosen model's source — no manual selection needed.

## Harnesses

Wrap the same task in different prompt/parse contracts so you can A/B "this model with raw tools" vs "this model with Hermes tags":

- `raw` — vanilla OpenAI-style tools, no prompt rewriting
- `hermes` — NousResearch `<tool_call>{...}</tool_call>` XML tags
- `qwen` — Qwen3 `<function_call>{...}</function_call>` tags
- `pi` — OpenClaw/Pi-style `<think>...</think>` + Hermes tags

## What ships in v1

- ✅ Six fixed task suites, deterministic + reproducible
- ✅ Live SSE progress per task
- ✅ Provider auto-detect (Ollama + OpenAI-compatible)
- ✅ Run persistence + leaderboard from disk
- ✅ Per-run detail + side-by-side compare
- ✅ Speed-score v2 curve (anchored on real M-series/RTX reference points)
- ✅ Preflight model-load check with actionable diagnostics
- ⏳ True streaming TTFT (currently 0 for openai_compat; requires streaming pass)
- ⏳ Hosted leaderboard at benchloop.com
- ⏳ Community submission flow

## License

TBD before the public launch.
