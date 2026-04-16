# BenchLoop v2 Spec — UX Pass 2

## Goal
Turn current prototype into a clean end-to-end flow:
**Discover model → inspect details → pull → chat → benchmark → inspect results → compare harnesses**

## Pre-work (done before Codex)
- [x] Install react-router-dom, convert tabs to routes
- [x] Clean up harness/ vs harnesses/ directory confusion
- [x] Add progress callback hooks to orchestrator

## Codex Task A: Benchmark Progress UI + Run Detail Page

### Benchmark Progress UI
**File:** `ui/src/tabs/BenchmarkTab.tsx` (refactor), `ui/src/components/BenchmarkProgress.tsx` (new)

Backend SSE stream (`/api/benchmark/stream/:runId`) now emits granular events:
- `run_started { total_tasks, suites }`
- `suite_started { suite, task_count }`
- `task_completed { suite, task_id, score, passed, latency_ms, error, completed_tasks, total_tasks }`
- `suite_completed { suite, score, pass_count, task_count }`
- `run_completed { overall_score, quality_score, speed_score, reliability_score }`
- `run_failed { error }`

Build a live progress display:
- Overall progress bar with "X / Y tasks" and percent
- ETA countdown (avg latency × remaining tasks)
- Suite-by-suite mini cards showing: name, progress bar, pass/fail count, current score
- Scrolling event log showing each task result as it arrives
- States: preparing → health check → running → completed / failed
- On completion, smoothly transition to result summary

### Run Detail Page
**File:** `ui/src/pages/RunDetailPage.tsx` (new), `ui/src/components/TaskResultTable.tsx` (new)
**Route:** `/benchmark/runs/:runId`

Uses existing `GET /api/benchmark/runs/:runId` which returns full run data including per-task results.

Show:
- Header: model, provider, harness, hardware, runtime, timestamp
- Score cards: overall, quality, speed, reliability
- Per-suite sections, each with:
  - Suite score + pass rate
  - Task table: task_id, passed, score, latency, output preview (truncated)
  - Expandable rows for full output + error
- Filters: show failures only, filter by suite

Click from: benchmark history table, leaderboard rows

### Acceptance criteria
- User sees live task-by-task progress during benchmark
- Can compute % complete and ETA from stream
- Completed runs have full drill-down page
- Failed tasks show actual error text

---

## Codex Task B: HF Model Detail Page

**File:** `ui/src/pages/HFModelDetailPage.tsx` (new)
**Route:** `/models/hf/:owner/:repo` (encoded)

Uses existing `GET /api/models/hf-details?repo=...`

Show:
- Model title, author, avatar
- Downloads, likes, tags
- Format badges
- File list with sizes (highlight GGUF files)
- Hardware fit assessment (reuse estimateCardSizeGb + hardware data)
- Pull button with same modal flow (or inline)
- If not GGUF: "Search GGUF version" with link back to models page filtered
- "Benchmark this model" shortcut if already pulled

Link from: HF model cards in ModelsTab (card click or dedicated button)

### Acceptance criteria
- Clicking model card navigates to detail page
- All file/size info visible
- Pull flow works from detail page
- Back navigation works

---

## Codex Task C: Chat Tab V1

**Backend file:** `api/routes/chat.py` (new)
**Frontend file:** `ui/src/tabs/ChatTab.tsx` (rewrite from stub)
**Route:** `/chat`

### Backend
Add `POST /api/chat` endpoint:
- Request: `{ model, endpoint, messages: [{role, content}] }`
- Response: SSE stream of token chunks, then final message
- Use Ollama `/api/chat` with `stream: true`, forward chunks as SSE
- On error: emit error event

Register in `api/main.py`.

### Frontend
- Model dropdown (same pattern as BenchmarkTab — flatten providers)
- Endpoint auto-syncs with selected model's provider
- Message list with user/assistant bubbles
- Input box with Enter to send
- Streaming response display
- Show tokens/sec from Ollama response metadata if available
- Clear chat button
- "Benchmark this model →" button in header area
- Handle errors gracefully (model not loaded, connection failed)

### Acceptance criteria
- Can chat with any detected local model
- Responses stream in real-time
- Errors show clean message, not silent failure
- Model selector works identically to benchmark tab

---

## Codex Task D: Harness Selector in Benchmark UI

**File:** `ui/src/tabs/BenchmarkTab.tsx`

Add harness dropdown to Run Configuration card:
- Options: `raw` (default), `ocplatform (coming soon)`, `hermes (coming soon)`
- Disabled options show "(coming soon)" and are not selectable
- Selected harness is passed to `POST /api/benchmark/run` body
- Show harness in result summary and run history table
- Show harness on run detail page

Backend `api/routes/benchmark.py` already passes harness through to RunConfig.

### Acceptance criteria
- Harness selector visible in benchmark config
- `raw` works as before
- Coming-soon items are clearly marked
- Harness recorded in results and visible in history/detail

---

## Routes (pre-work, already done)

```
/              → ModelsTab (home/discovery)
/models        → ModelsTab
/models/hf/:id → HFModelDetailPage
/chat          → ChatTab
/benchmark     → BenchmarkTab
/benchmark/runs/:id → RunDetailPage
/leaderboard   → LeaderboardTab
```

Nav bar uses Links instead of tab state.

---

## Styling rules for Codex
- Dark theme: `--bg: #0a0a0a`, `--card: #141414`, `--border: #262626`, `--accent: #3b82f6`
- Use existing CSS classes: `.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.section-title`, `.input`, `.score`, `.score-green/yellow/red`
- Use existing components: `ScoreBadge`, `HardwareSummary`
- Monospace font: `var(--mono)`
- Sans font: `var(--sans)`
- No external UI libraries (no Tailwind, no MUI, no shadcn)
- Inline styles are fine (existing pattern)

## File structure
```
ui/src/
  main.tsx          — router setup
  App.tsx           — layout + nav
  tabs/
    ModelsTab.tsx
    BenchmarkTab.tsx
    ChatTab.tsx
    LeaderboardTab.tsx
  pages/
    RunDetailPage.tsx    (new)
    HFModelDetailPage.tsx (new)
  components/
    HardwareSummary.tsx
    ScoreBadge.tsx
    BenchmarkProgress.tsx (new)
    TaskResultTable.tsx   (new)
  hooks/
    useApi.ts

api/
  main.py
  routes/
    benchmark.py
    chat.py          (new)
    hardware.py
    health.py
    models.py
```

## Not in this sprint
- Compare view (needs run detail first)
- Full harness adapters for OCPlatform/Hermes
- Community leaderboard / submission
- Landing/marketing page
- Mobile responsive pass
