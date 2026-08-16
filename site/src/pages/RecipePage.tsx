import { Link, useParams } from 'react-router-dom'

const launchCommand = `llama-server \\
  -m Qwen3.8-27B-UD-Q4_K_XL.gguf \\
  -ngl 999 -fa on --jinja -np 1 \\
  --cache-type-k q8_0 --cache-type-v q8_0 \\
  --spec-type draft-mtp --spec-draft-n-max 4 \\
  --temperature 1.0 --top-p 0.95 --top-k 30 \\
  --host 127.0.0.1 --port 8080`

export default function RecipePage() {
  const { recipeId } = useParams()

  return (
    <div className="revamp-recipe-page">
      <div className="revamp-recipe-breadcrumb"><Link to="/recipes">Recipes</Link><span>/</span><span>{recipeId}</span></div>
      <section className="revamp-recipe-hero card-premium">
        <div>
          <span className="revamp-section-kicker">Verified recipe · reproduced on 1 rig</span>
          <h1>Qwen3.8-27B on a single RTX 4090</h1>
          <p>Fast, full-offload CUDA serving with a quality-preserving dynamic GGUF and the model’s native MTP head.</p>
          <div className="revamp-tags large"><span>RTX 4090</span><span>UD-Q4_K_XL</span><span>llama.cpp</span><span>MTP4</span></div>
        </div>
        <div className="revamp-recipe-score"><span>BenchLoop score</span><strong>79.3</strong><small>decode tok/s</small></div>
      </section>

      <div className="revamp-recipe-grid">
        <article className="revamp-recipe-body">
          <section className="card">
            <div className="revamp-card-number">01</div><h2>What this recipe optimizes</h2>
            <p>The model stays entirely on the GPU, KV cache remains precise enough for quality testing, and native MTP tries up to four draft tokens. For mixed workloads, also benchmark depth two—it can win when acceptance falls.</p>
            <div className="revamp-feed-metrics">
              <div className="is-accent"><span>Steady decode</span><strong>79.3 tok/s</strong></div>
              <div><span>Coding peak</span><strong>~97 tok/s</strong></div>
              <div><span>Coding suite</span><strong>93.8</strong></div>
              <div><span>VRAM</span><strong>~22.8 GB</strong></div>
            </div>
          </section>
          <section className="card">
            <div className="revamp-card-number">02</div><h2>Launch command</h2>
            <pre className="revamp-code"><code>{launchCommand}</code><button type="button">Copy</button></pre>
            <p className="revamp-note">Use a current llama.cpp CUDA build. Start at 8K context, validate output parity, then expand context while recording KV precision and peak VRAM.</p>
          </section>
          <section className="card">
            <div className="revamp-card-number">03</div><h2>Reproduce with BenchLoop</h2>
            <pre className="revamp-code"><code>benchloop run --endpoint http://127.0.0.1:8080 --model qwen3.8-27b --harness qwen --all</code><button type="button">Copy</button></pre>
            <p className="revamp-note">Publishing should attach runtime commit, exact model hash, flags, context, sampling, MTP acceptance, and a signed machine profile.</p>
          </section>
        </article>

        <aside className="revamp-rail">
          <section className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Recipe owner</span></div>
            <Link to="/u/eric" className="revamp-owner"><span className="revamp-owner-avatar">E</span><span><strong>@eric</strong><small>12 verified runs</small></span></Link>
          </section>
          <section className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Compatibility</span></div>
            <div className="revamp-check-list"><span>✓ NVIDIA Ada</span><span>✓ 24 GB VRAM</span><span>✓ OpenAI-compatible API</span><span>✓ Tools via Jinja template</span><span>○ Vision needs mmproj</span></div>
          </section>
          <button type="button" className="btn btn-primary revamp-wide">Run on my 4090</button>
          <button type="button" className="btn btn-secondary revamp-wide">Fork recipe</button>
        </aside>
      </div>
    </div>
  )
}
