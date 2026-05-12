import { Link } from 'react-router-dom'
import CliInstall from '../components/CliInstall'

const cliInstalls = [
  {
    title: 'pipx (recommended)',
    body: 'Isolated Python install, available as the `benchloop` command on PATH.',
    code: 'pipx install benchloop',
  },
  {
    title: 'pip',
    body: 'For environments that already have a Python venv.',
    code: 'pip install benchloop',
  },
  {
    title: 'From source',
    body: 'Clone the repo and install in editable mode — best if you want to hack on suites.',
    code: 'git clone https://github.com/outsourc-e/bench-loop\ncd bench-loop\npip install -e .',
  },
]

const cloneInstalls = [
  {
    title: 'Clone + run',
    body: 'Run the full BenchLoop stack — CLI plus local web app — from source.',
    code: 'git clone https://github.com/outsourc-e/bench-loop\ncd bench-loop\nmake dev',
  },
  {
    title: 'Docker (coming soon)',
    body: 'Single-container BenchLoop with the local API and web UI bundled.',
    code: 'docker run --rm -it -p 5180:5180 -p 8877:8877 \\\n  -v $HOME/.bench-loop:/root/.bench-loop \\\n  local docker build',
  },
]

export default function DownloadPage() {
  return (
    <div>
      <div className="page-kicker">Download</div>
      <h1>Install BenchLoop.</h1>
      <p className="page-subtitle">
        BenchLoop ships as a CLI for benchmarks and as a local web app for visualization. Pick whichever fits.
      </p>

      <section style={{ marginTop: 32 }}>
        <h2>Quickstart</h2>
        <p className="page-subtitle">Install, then run your first benchmark in one go.</p>
        <div style={{ marginTop: 16 }}>
          <CliInstall />
        </div>
      </section>

      <section style={{ marginTop: 48 }}>
        <h2>CLI install methods</h2>
        <div className="download-grid">
          {cliInstalls.map((m) => (
            <div className="download-card" key={m.title}>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
              <pre>{m.code}</pre>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 48 }}>
        <h2>Run the full stack locally</h2>
        <p className="page-subtitle">
          The same CLI + the local web dashboard (Models, Benchmark, Leaderboard, Compare, Chat).
        </p>
        <div className="download-grid">
          {cloneInstalls.map((m) => (
            <div className="download-card" key={m.title}>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
              <pre>{m.code}</pre>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 48 }}>
        <h2>What you get</h2>
        <div className="feature-grid">
          <div className="feature-card card">
            <div className="feature-icon">⌘</div>
            <h3><code>benchloop</code> CLI</h3>
            <p>Single-binary benchmark runner with JSON output, persisted runs, and scriptable defaults.</p>
          </div>
          <div className="feature-card card">
            <div className="feature-icon">▦</div>
            <h3>Local web app</h3>
            <p>Models, Benchmark, Leaderboard, Compare, and Chat tabs running on <code>127.0.0.1:5180</code>.</p>
          </div>
          <div className="feature-card card">
            <div className="feature-icon">↗</div>
            <h3>Public sync</h3>
            <p>Export your local runs to <code>~/.bench-loop/exports/</code> and submit them to the public leaderboard.</p>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 48, marginBottom: 16 }}>
        <h2>Next steps</h2>
        <p className="page-subtitle">
          New to BenchLoop? Run a fast smoke benchmark, then read the docs to understand scoring and suites.
        </p>
        <div className="landing-actions" style={{ marginTop: 16 }}>
          <Link to="/docs" className="btn btn-primary">Read the docs</Link>
          <Link to="/leaderboard" className="btn btn-secondary">See published runs</Link>
        </div>
      </section>
    </div>
  )
}
