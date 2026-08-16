# BenchLoop Revamp Blueprint

## Product thesis

BenchLoop should become the intelligence and execution layer for local AI: a place where someone can ask what will work on their exact hardware, inspect the evidence, reproduce the setup, and publish the result.

The simplest description is:

> Google + X + an autonomous benchmark lab for local AI.

The moat is not a generic chat box or a token-per-second leaderboard. It is the growing structured graph connecting hardware, model artifacts, runtimes, recipes, benchmark methodology, quality, speed, and the builders who produced the evidence.

## North-star loop

1. A user adds or detects a hardware rig.
2. They ask a hardware-aware question.
3. BenchLoop returns a sourced recommendation and an executable recipe.
4. The local Runner launches the recipe and runs a comparable benchmark.
5. A signed result is attached to the recipe, rig, model, runtime, and user.
6. The user publishes a run or post; the verified evidence improves future answers.

`Ask → Recipe → Runner → Verified run → Community signal → Better Ask`

## Product surfaces

### Public web

Owns discovery, identity, history, comparison, and community.

- Search-first landing page
- Hardware-aware Ask Loop answers with citations
- For You feed
- Local AI news and trend pages
- Latest verified runs
- Reproducible recipe library
- Builders and public profiles
- Model, quant, runtime, and hardware detail pages
- Leaderboards and comparisons
- Saved answers, runs, and experiments

### Local Runner / CLI

Owns execution, measurement, and the trust boundary.

- Detect hardware and installed runtimes
- Pull or select model artifacts
- Launch reproducible recipes
- Execute short, long-context, quality, tool, vision, and agent tests
- Capture exact flags, versions, hashes, sampling, memory, and MTP acceptance
- Sign and publish an intentionally redacted run
- Re-run a public recipe on the user's machine

### Intelligence layer

Owns retrieval, ranking, synthesis, and action generation.

- Query the structured BenchLoop graph first
- Retrieve official model/runtime documentation
- Rank community reports below verified runs
- Generate answers constrained by the user's rig and objective
- Emit actions such as `Test on my rig`, `Open recipe`, `Compare`, and `Optimize`
- Support a provider router: local model, per-user Grok OAuth/BYO key, and hosted fallback

Do not build the public product around one operator's personal OAuth token. A personal xAI/Grok session can power development or an admin research agent; public users should connect their own provider or use a metered hosted fallback.

## Information architecture

| Route | Purpose |
| --- | --- |
| `/` | Personalized search and briefing |
| `/ask?q=` | Sourced, hardware-aware answer with executable actions |
| `/explore` | Mixed discovery feed |
| `/news` | Local AI releases and changes, ranked by practical impact |
| `/runs` | Fresh verified benchmark results |
| `/recipes` | Reproducible configurations |
| `/recipes/:id` | Exact artifacts, flags, environment, results, and reproductions |
| `/builders` | People, labs, and maintainers |
| `/u/:handle` | Profile, rigs, runs, recipes, posts, and experiments |
| `/leaderboard` | Comparable ranked results with quality floors |
| `/models/:id` | Model family, artifacts, compatible runtimes, and best recipes |
| `/hardware/:id` | What works on a specific chip/GPU and memory tier |
| `/docs` | Methodology, trust, Runner, and API documentation |
| `/download` | Install and connect the Runner |

## Canonical data graph

`User → Rig → Stack → Recipe → Experiment → Run → Post`

Core entities:

- **User:** identity, bio, follows, provider connections, privacy settings
- **Rig:** stable machine identity, CPU/GPU/SoC, RAM/VRAM, OS, visibility
- **Artifact:** model, quantization method, weight hash, tokenizer, MTP head, vision projector
- **Runtime:** engine, version/commit, backend, capabilities
- **Recipe:** artifact + runtime + launch flags + sampling + context/KV configuration
- **Experiment:** a comparison goal and controlled variables
- **Run:** benchmark version, prompt corpus hash, metrics, suite outputs, validation state
- **Post:** commentary attached to one or more structured objects
- **Source:** official document, release, repository, model card, or community report

Posts should never be the only place important benchmark fields live. A post references structured records so search, ranking, and reproduction remain reliable.

## Trust model

Each result receives a visible verification level:

1. **Claimed:** manually entered, not reproduced.
2. **Captured:** produced by BenchLoop Runner with environment metadata.
3. **Signed:** bound to a user and stable rig identity.
4. **Reproduced:** independently repeated within a defined tolerance.

Ranking views must distinguish full runs, suite-only runs, and speed-only probes. A partial run cannot silently outrank a full benchmark. Speed scores must be based on recorded backend and runtime facts, not inferred from TTFT.

Minimum reproducibility envelope:

- artifact repository, filename, and cryptographic hash
- runtime version or commit
- full launch flags
- context length and prompt length
- KV cache type
- sampling values
- speculative method, draft depth, and acceptance rate
- prompt, generation, TTFT, decode, memory, thermals, and power where available
- benchmark suite and task-set versions

## Experience priorities

### Signed-out home

- Large Ask Loop input
- Examples that teach the product
- Tabs for For You, News, Latest Runs, Recipes, and Builders
- A high-signal mixed feed
- Clear Runner install path
- No fake personalization language unless hardware is known

### Signed-in home

- Detected rigs immediately visible
- Recommendations scoped to those rigs
- Changes since the user's last visit
- Experiments waiting to run or compare
- People and stacks the user follows

### Answer page

- Direct recommendation at the top
- Separate winners for speed, quality, and daily-driver tradeoffs
- Evidence count and trust labels
- Exact compatibility and memory constraints
- Actions to run, save, compare, fork, or share
- Uncertainty and unresolved tests stated explicitly

### Profile

- Identity and follows
- Public rigs with redaction controls
- Verified runs, recipes, posts, experiments, and fine-tunes
- Reputation derived from reproducibility, not engagement alone

## Delivery sequence

### Milestone 0 — local concept prototype

- Rewire the public site shell
- Build search-first landing page
- Build mocked Ask Loop answer
- Build mixed feed, recipe, and profile views
- Reuse the current visual identity and leaderboard

Success: the direction is understandable in one viewport and all core concepts are clickable locally.

### Milestone 1 — trustworthy benchmark foundation

- Correct speed-scoring backend assumptions
- Separate run types in rankings
- Create stable rig identity
- Expand artifact/runtime/recipe metadata
- Add signed submission and explicit publish consent
- Record agent-suite token and latency metrics correctly

Success: the data can support product claims without manual cleanup.

### Milestone 2 — accounts and structured publishing

- Add user authentication
- Create profiles, rigs, recipes, posts, follows, and saves
- Migrate current anonymous runs into claimable records
- Add Runner device pairing and scoped API tokens

Success: users can own a lab and publish reproducible objects.

### Milestone 3 — search and answer engine

- Add hybrid lexical/vector search over structured records and sources
- Build hardware constraint filters before LLM synthesis
- Add answer citations and confidence/verification labels
- Add provider router and usage controls
- Convert recommendations into Runner jobs

Success: Ask Loop produces grounded, actionable answers for a known rig.

### Milestone 4 — community and news

- Add feed ranking, comments, follows, notifications, and moderation
- Ingest official releases, repositories, model cards, and curated community reports
- Use X as an input/link surface, not the canonical datastore
- Add duplicate detection and structured claim extraction

Success: important local AI changes reliably appear even if they missed a user's social feed.

### Milestone 5 — experiment and fine-tuning lab

- Define controlled experiment groups and automatic reruns
- Compare checkpoints against base-model references
- Track datasets, training recipes, H100 jobs, artifacts, and evaluation deltas
- Publish fine-tune cards with complete lineage

Success: BenchLoop closes the loop from discovering a model to improving it and proving the improvement.

## Immediate build decision

The first implementation stays frontend-only and uses representative local data. Authentication, provider OAuth, publishing, and database changes remain deliberately mocked until the benchmark trust foundation and schema are agreed. This makes the product direction cheap to change without creating disposable backend contracts.
