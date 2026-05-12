const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'install', label: 'Install' },
  { id: 'run', label: 'Run a benchmark' },
  { id: 'suites', label: 'Suites' },
  { id: 'harnesses', label: 'Harnesses' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'publish', label: 'Publish a run' },
  { id: 'api', label: 'API' },
]

export default function DocsPage() {
  return (
    <div>
      <div className="page-kicker">Docs</div>
      <h1>BenchLoop documentation.</h1>
      <p className="page-subtitle">
        Everything you need to install BenchLoop, run a benchmark, interpret the scores, and publish your runs.
      </p>

      <div className="docs-layout" style={{ marginTop: 32 }}>
        <nav className="docs-toc" aria-label="Docs sections">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="docs-content">
          <section id="overview">
            <h2>Overview</h2>
            <p>
              BenchLoop is a local-first benchmark suite for LLMs. It pits any model running on your hardware
              against six fixed task suites and produces a single comparable run: <strong>quality, speed, and
              reliability</strong>, plus per-task receipts.
            </p>
            <p>It supports every common local backend:</p>
            <ul>
              <li><code>ollama</code> — auto-detected at <code>http://localhost:11434</code></li>
              <li><code>openai_compat</code> — LM Studio, MLX / Osaurus, vLLM, Jan, oMLX, any <code>/v1/chat/completions</code></li>
            </ul>
          </section>

          <section id="install">
            <h2>Install</h2>
            <p>Recommended is <code>pipx</code>, which keeps BenchLoop isolated and on PATH:</p>
            <pre>{`pipx install benchloop
benchloop --version`}</pre>
            <p>Other install methods are on the <a href="/download">Download</a> page.</p>
          </section>

          <section id="run">
            <h2>Run a benchmark</h2>
            <p>
              Pick a model that already exists on a local endpoint, then run all six suites:
            </p>
            <pre>{`benchloop run \\
  --model qwen3:8b \\
  --endpoint http://localhost:11434 \\
  --suites speed,toolcall,coding,dataextract,instructfollow,reasonmath`}</pre>
            <p>The CLI prints scores live and writes a full run to <code>~/.bench-loop/runs/</code>.</p>
            <p>Single-suite smoke test:</p>
            <pre>{`benchloop run --model qwen3:8b --suites speed`}</pre>
            <p>
              For OpenAI-compatible endpoints (LM Studio, MLX, vLLM, etc.), pass{' '}
              <code>--provider openai_compat</code>.
            </p>
          </section>

          <section id="suites">
            <h2>Suites</h2>
            <ul>
              <li><strong>speed</strong> — short / medium / long-context throughput, TTFT, generation tok/s.</li>
              <li><strong>toolcall</strong> — single-shot tool-call correctness across realistic tasks (weather, stocks, email).</li>
              <li><strong>coding</strong> — executable Python tasks with sandboxed verification and 10s timeout.</li>
              <li><strong>dataextract</strong> — JSON / structured extraction from messy natural language.</li>
              <li><strong>instructfollow</strong> — formatting, exactness, and constraint compliance.</li>
              <li><strong>reasonmath</strong> — small reasoning + math tasks with deterministic checks.</li>
              <li><strong>agent</strong> — multi-turn agent loop with real tool execution. BenchLoop runs the loop: the model emits a tool call, BenchLoop actually executes it (calculator, weather, stocks, strings), feeds the result back as a <code>tool</code> message, and the model iterates until done. Scored on correctness, efficiency, no-hallucination, and required-tool coverage.</li>
            </ul>
          </section>

          <section id="harnesses">
            <h2>Harnesses</h2>
            <p>
              Same model, different prompt/parse contract. Lets you A/B "this model with raw tools" vs
              "this model with Hermes tags".
            </p>
            <ul>
              <li><code>raw</code> — vanilla OpenAI-style tools.</li>
              <li><code>hermes</code> — <code>{`<tool_call>{...}</tool_call>`}</code> XML tags.</li>
              <li><code>qwen</code> — <code>{`<function_call>{...}</function_call>`}</code> tags.</li>
              <li><code>pi</code> — <code>{`<think>...</think>`}</code> reasoning + Hermes tool tags.</li>
            </ul>
          </section>

          <section id="scoring">
            <h2>Scoring</h2>
            <p>
              <strong>Overall</strong> = <code>0.55 · quality + 0.20 · speed + 0.25 · reliability</code>.
            </p>
            <ul>
              <li><strong>Quality</strong> = mean of all non-speed suite scores (size-fair).</li>
              <li><strong>Speed</strong> = <code>12.54 · log2(tok/s) + 0.9</code>, clamped to 0–100. Anchored on real M-series and RTX reference points.</li>
              <li><strong>Reliability</strong> = pass rate across all tasks.</li>
              <li><strong>Agent</strong> = 25 points each for <code>correct_final</code>, <code>efficient</code> (under max turns), <code>no_hallucinated_tools</code>, and <code>all_required_called</code>. Averaged across tasks.</li>
            </ul>
          </section>

          <section id="publish">
            <h2>Publish a run</h2>
            <p>Export your local runs to the public leaderboard format:</p>
            <pre>{`benchloop export --output ~/.bench-loop/exports/my-runs.json
# then open a PR against ocplatform/bench-loop with your JSON`}</pre>
            <p>
              The published JSON is what powers the <a href="/leaderboard">/leaderboard</a> page on this site.
            </p>
          </section>

          <section id="api">
            <h2>Local API</h2>
            <p>The local web app at <code>http://127.0.0.1:5180</code> is backed by a FastAPI server at <code>:8877</code>.</p>
            <ul>
              <li><code>GET  /api/health</code></li>
              <li><code>GET  /api/models?endpoint=…</code></li>
              <li><code>POST /api/benchmark/run</code></li>
              <li><code>GET  /api/benchmark/stream/{'{runId}'}</code> (SSE)</li>
              <li><code>GET  /api/benchmark/runs</code></li>
              <li><code>GET  /api/benchmark/runs/{'{runId}'}</code></li>
            </ul>
            <p>Full schema in the source repo.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
