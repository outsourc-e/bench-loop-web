const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'install', label: 'Install CLI' },
  { id: 'dashboard', label: 'Local dashboard' },
  { id: 'backends', label: 'Pick a backend' },
  { id: 'run', label: 'Run a benchmark' },
  { id: 'suites', label: 'Suites' },
  { id: 'harnesses', label: 'Harnesses' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'publish', label: 'Publish a run' },
  { id: 'api', label: 'API' },
  { id: 'troubleshoot', label: 'Troubleshooting' },
  { id: 'links', label: 'Links' },
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
              against seven fixed task suites and produces a single comparable run: <strong>quality, speed, and
              reliability</strong>, plus per-task receipts.
            </p>
            <p>It supports every common local backend:</p>
            <ul>
              <li><code>ollama</code> — auto-detected at <code>http://localhost:11434</code></li>
              <li><code>openai_compat</code> — LM Studio, MLX / Osaurus, vLLM, Jan, oMLX, any <code>/v1/chat/completions</code></li>
            </ul>
          </section>

          <section id="install">
            <h2>Install the CLI</h2>
            <p>Recommended path — <code>pipx</code> keeps BenchLoop isolated and on PATH:</p>
            <pre>{`pipx install benchloop-cli
benchloop --version`}</pre>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
              The PyPI distribution is <strong>benchloop-cli</strong>. Installed console commands are <code>benchloop</code> and <code>bench-loop</code>.
            </p>

            <h3>No pipx? On macOS:</h3>
            <pre>{`python3 -m pip install --user --break-system-packages pipx
python3 -m pipx ensurepath
# open a new terminal window, then:
pipx install benchloop-cli`}</pre>

            <h3>Plain pip</h3>
            <pre>{`pip install benchloop-cli`}</pre>

            <h3>From source (for development)</h3>
            <pre>{`git clone https://github.com/outsourc-e/bench-loop
cd bench-loop
pip install -e .`}</pre>

            <h3>Verify</h3>
            <pre>{`benchloop info       # lists installed suites + harnesses
benchloop --version  # 0.1.1`}</pre>
          </section>

          <section id="dashboard">
            <h2>Local web dashboard</h2>
            <p>
              The CLI is enough to benchmark, score, and auto-publish. If you want the
              visual dashboard (Models / Benchmark / Leaderboard / Compare / Chat tabs)
              running on <code>127.0.0.1:5180</code>, clone the web app repo and start it.
            </p>
            <pre>{`# Clone both repos side-by-side
git clone https://github.com/outsourc-e/bench-loop
git clone https://github.com/outsourc-e/bench-loop-web

# Start the dashboard (API + UI)
cd bench-loop-web
./start.sh`}</pre>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
              The dashboard auto-discovers models on <code>localhost:11434</code> (Ollama),
              <code>localhost:1234</code> (LM Studio), <code>localhost:8000</code> (MLX/Osaurus / vLLM), and any other endpoints you add.
            </p>
          </section>

          <section id="backends">
            <h2>Pick a backend</h2>
            <p>BenchLoop runs against any local OpenAI-compatible or Ollama endpoint:</p>
            <ul>
              <li><strong>Ollama</strong> — <code>http://localhost:11434</code> — default. <code>--provider ollama</code></li>
              <li><strong>LM Studio</strong> — <code>http://localhost:1234</code> — <code>--provider openai_compat</code></li>
              <li><strong>MLX / Osaurus</strong> — <code>http://localhost:8000</code> — <code>--provider openai_compat</code></li>
              <li><strong>vLLM</strong> — <code>--provider openai_compat</code></li>
              <li><strong>Jan</strong> — <code>--provider openai_compat</code></li>
              <li><strong>llama.cpp / llama-server</strong> — <code>--provider openai_compat</code></li>
            </ul>
            <p>Pull a model first if you're on a fresh Ollama install:</p>
            <pre>{`ollama pull qwen3:8b
# or something smaller:
ollama pull qwen3:1.7b`}</pre>
          </section>

          <section id="run">
            <h2>Run a benchmark</h2>
            <p>
              Pick a model that already exists on a local endpoint, then run all seven suites:
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
              A <strong>harness</strong> wraps a task two ways: <em>prepare</em> rewrites the system prompt + tool
              schema before sending to the model, and <em>postprocess</em> parses the model's output to extract tool
              calls. Same model + same task + different harness = different scores, which lets you A/B
              "this model with raw tools" vs "this model with Hermes tags".
            </p>
            <p>
              All harnesses ship inside <code>benchloop-cli</code> — no extra installs. Run
              <code style={{ display: 'inline-block', marginLeft: 4 }}>benchloop info</code>
              to see them registered.
            </p>
            <h3>How to A/B test</h3>
            <pre>{`# Same model, four harnesses:
benchloop run --model qwen3:8b --harness raw
benchloop run --model qwen3:8b --harness hermes
benchloop run --model qwen3:8b --harness qwen
benchloop run --model qwen3:8b --harness pi

# Then compare on /leaderboard — results dedupe per (model, harness)`}</pre>
            <h3>What each harness actually does</h3>
            <ul>
              <li><code>raw</code> — vanilla OpenAI-style <code>tools=[…]</code> param. Whatever your provider does natively.</li>
              <li><code>hermes</code> — NousResearch Hermes format: tools embedded in system prompt as <code>{`<tools>`}</code> JSON-schema, model emits <code>{`<tool_call>{...}</tool_call>`}</code> XML tags.</li>
              <li><code>qwen</code> — Qwen3-Coder / Qwen-Agent style: <code>{`<function_call>{...}</function_call>`}</code> XML tags.</li>
              <li><code>pi</code> — <code>{`<think>...</think>`}</code> reasoning + Hermes tool tags. Strips reasoning before scoring so verbose chain-of-thought doesn't tank quality scores.</li>
            </ul>
            <h3>Why this matters</h3>
            <p>
              Many "this model can't tool-call" claims are actually "this model can't tool-call with the harness you tried."
              We've seen +15 overall just from picking the right harness for the model family. Filter the leaderboard
              by harness to see this effect.
            </p>
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
            <p>
              Every completed benchmark auto-publishes to the public leaderboard at <code>api.bench-loop.com/submit</code>.
              Runs are deduped by machine id + run id so the same run from the same machine won't be double-counted.
            </p>
            <p>To opt out of auto-publishing, set:</p>
            <pre>{`export BENCHLOOP_NO_SUBMIT=1`}</pre>
            <p>
              You can still manually export local runs as a static leaderboard JSON file:
            </p>
            <pre>{`benchloop export --output ./my-runs.json`}</pre>
            <p>
              The public board lives at <a href="/leaderboard">/leaderboard</a>.
            </p>
          </section>

          <section id="api">
            <h2>APIs</h2>
            <p><strong>Local API</strong> — <code>http://127.0.0.1:8877</code> when the dashboard is running:</p>
            <ul>
              <li><code>GET  /api/health</code></li>
              <li><code>GET  /api/models?endpoint=…</code></li>
              <li><code>POST /api/benchmark/run</code></li>
              <li><code>POST /api/benchmark/cancel/{'{runId}'}</code></li>
              <li><code>GET  /api/benchmark/stream/{'{runId}'}</code> (SSE)</li>
              <li><code>GET  /api/benchmark/runs</code></li>
              <li><code>GET  /api/benchmark/runs/{'{runId}'}</code></li>
            </ul>
            <p style={{ marginTop: 18 }}><strong>Public API</strong> — <code>https://api.bench-loop.com</code>:</p>
            <ul>
              <li><code>POST /submit</code> — publish a run (called automatically by CLI)</li>
              <li><code>GET  /leaderboard</code> — best run per (model, harness)</li>
              <li><code>GET  /runs/{'{id}'}</code> — fetch a specific submitted run</li>
            </ul>
          </section>

          <section id="troubleshoot">
            <h2>Troubleshooting</h2>
            <h3><code>Model '...' not found on http://localhost:11434</code></h3>
            <p>Your Ollama instance doesn't have that model pulled. Pull it:</p>
            <pre>{`ollama pull qwen3:8b`}</pre>
            <p>Or list what you do have: <code>ollama list</code>.</p>

            <h3><code>Cannot reach endpoint</code> / connection refused</h3>
            <ul>
              <li>Ollama running? <code>ollama serve</code> in another terminal.</li>
              <li>LM Studio? Open the app and toggle the local server on.</li>
              <li>Wrong port? Pass <code>--endpoint http://localhost:1234</code> (or your actual host).</li>
            </ul>

            <h3>Stop auto-publishing</h3>
            <pre>{`export BENCHLOOP_NO_SUBMIT=1`}</pre>

            <h3>Reset everything</h3>
            <pre>{`rm -rf ~/.bench-loop/runs    # delete local run history
pipx reinstall benchloop-cli  # reinstall the CLI`}</pre>
          </section>

          <section id="links">
            <h2>Links</h2>
            <ul>
              <li>CLI repo: <a href="https://github.com/outsourc-e/bench-loop" target="_blank" rel="noreferrer">github.com/outsourc-e/bench-loop</a></li>
              <li>Web app repo: <a href="https://github.com/outsourc-e/bench-loop-web" target="_blank" rel="noreferrer">github.com/outsourc-e/bench-loop-web</a></li>
              <li>PyPI: <a href="https://pypi.org/project/benchloop-cli/" target="_blank" rel="noreferrer">pypi.org/project/benchloop-cli</a></li>
              <li>Public leaderboard: <a href="/leaderboard">/leaderboard</a></li>
              <li>Public API: <a href="https://api.bench-loop.com/health" target="_blank" rel="noreferrer">api.bench-loop.com</a></li>
              <li>License: MIT</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
