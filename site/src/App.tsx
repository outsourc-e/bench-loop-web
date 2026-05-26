import { useEffect, useMemo, useRef, useState } from "react";
import { resolveApiBase } from "./api";

type TabId = "models" | "benchmark" | "leaderboard" | "chat" | "submit" | "profile";
type ProviderId = "ollama" | "openai_compat";

type UserProfile = {
  id: string;
  login: string;
  avatar_url: string;
  html_url: string;
  name?: string;
  bio?: string;
  x_handle?: string;
  github_username?: string;
  website?: string;
  api_key?: string;
  run_count: number;
};

type BenchRun = {
  id: string;
  timestamp: string;
  provider: string;
  harness: string;
  harness_version?: string;
  model: { model_id: string };
  machine: {
    machine_id: string;
    cpu?: string;
    gpu?: string;
    gpu_memory_gb?: number;
    system_memory_gb?: number;
    os?: string;
    backend?: string;
  };
  overall_score: number;
  quality_score: number;
  speed_score: number;
  reliability_score: number;
  value_score: number;
  total_runtime_sec: number;
  speed_metrics: {
    ttft_ms: number;
    prompt_eval_tok_per_sec: number;
    generation_tok_per_sec: number;
    total_latency_ms: number;
  };
  suites: Record<
    string,
    {
      suite: string;
      score: number;
      task_count: number;
      pass_count: number;
      fail_count: number;
      median_latency_ms: number;
      tasks: Array<{
        task_id: string;
        passed: boolean;
        score: number;
        latency_ms: number;
        error?: string;
      }>;
    }
  >;
};

type LeaderboardRow = {
  rank: number;
  runId: string;
  model: string;
  quantization: string;
  provider: string;
  harness: string;
  overall: number;
  quality: number;
  speed: number;
  reliability: number;
  value: number;
  runtimeSec: number;
  machine: string;
  backend: string;
  gpu: string;
  systemMemoryGb: number;
  gpuMemoryGb: number;
  ttftMs: number;
  promptTokPerSec: number;
  genTokPerSec: number;
  totalLatencyMs: number;
  suiteCount: number;
  suiteNames: string[];
  isFullBenchmark: boolean;
  timestamp: string;
};

type ChatMetric = {
  latencyMs: number;
  ttftMs: number;
  promptTokens: number;
  completionTokens: number;
  tokensPerSecond: number;
  model: string;
  provider: string;
  endpoint: string;
  harness: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  metrics?: ChatMetric;
};

type SubmissionPreview = {
  schemaVersion: string;
  submittedAt: string;
  run: Record<string, unknown>;
  privacy: Record<string, unknown>;
};

const TAB_COPY: Record<TabId, { label: string; subtitle: string }> = {
  models: { label: "Models", subtitle: "Discover endpoint models and hand them off into benchmarks." },
  benchmark: { label: "Benchmark", subtitle: "Run local-first benchmark suites and inspect full run details." },
  leaderboard: { label: "Leaderboard", subtitle: "Best local model + harness combinations on this machine." },
  chat: { label: "Chat", subtitle: "Quick smoke-test any local or self-hosted model with live metrics." },
  submit: { label: "Submit", subtitle: "Preview the hosted leaderboard payload contract before shipping it." },
  profile: { label: "Profile", subtitle: "Your account, API key, and benchmark history." },
};

const PROVIDERS: Array<{ value: ProviderId; label: string }> = [
  { value: "ollama", label: "Ollama" },
  { value: "openai_compat", label: "OpenAI-compatible" },
];

function formatScore(value: number | undefined) {
  return Number.isFinite(value) ? (value ?? 0).toFixed(1) : "0.0";
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatSeconds(value?: number) {
  return `${(value ?? 0).toFixed(2)}s`;
}

function formatMachine(run: BenchRun) {
  const machine = run.machine || {};
  const parts = [machine.gpu, machine.cpu].filter(Boolean);
  return parts.length ? parts.join(" / ") : machine.machine_id || "Unknown machine";
}

function extractModelFamily(modelName: string): string {
  const match = modelName.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  return match ? match[1].toLowerCase() : "unknown";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await resolveApiBase();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      detail = payload.detail || JSON.stringify(payload);
    } catch {
      try {
        detail = await response.text();
      } catch {
        // ignore
      }
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

function ScorePill({ value }: { value: number }) {
  const tone = value >= 85 ? "good" : value >= 70 ? "mid" : "bad";
  return <span className={`score-pill ${tone}`}>{formatScore(value)}</span>;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail ? <div className="stat-detail">{detail}</div> : null}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("benchmark");
  const [provider, setProvider] = useState<ProviderId>("ollama");
  const [endpoint, setEndpoint] = useState("http://localhost:11434");
  const [model, setModel] = useState("");
  const [harness, setHarness] = useState("raw");
  const [supportedSuites, setSupportedSuites] = useState<string[]>([]);
  const [supportedHarnesses, setSupportedHarnesses] = useState<string[]>(["raw"]);
  const [selectedSuites, setSelectedSuites] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [runs, setRuns] = useState<BenchRun[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [jobProgress, setJobProgress] = useState<{ phase?: string; message?: string; completedSuites?: number; totalSuites?: number } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [submissionPreview, setSubmissionPreview] = useState<SubmissionPreview | null>(null);
  const [search, setSearch] = useState("");
  const [harnessFilter, setHarnessFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Leaderboard enhanced state (ported from LeaderboardTab)
  const [lbSubTab, setLbSubTab] = useState<"all" | "local" | "cloud">("all");
  const [lbPage, setLbPage] = useState(1);
  const [gpuFilter, setGpuFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [selectedCompare, setSelectedCompare] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const LB_PAGE_SIZE = 25;

  async function loadMeta() {
    const data = await api<{ supportedSuites: string[]; supportedHarnesses: string[] }>("/api/benchloop/meta");
    setSupportedSuites(data.supportedSuites);
    setSelectedSuites((current) => current.length ? current.filter((suite) => data.supportedSuites.includes(suite)) : data.supportedSuites);
    setSupportedHarnesses(data.supportedHarnesses);
    setHarness((current) => data.supportedHarnesses.includes(current) ? current : (data.supportedHarnesses[0] || "raw"));
  }

  async function loadRuns() {
    setLoadingRuns(true);
    try {
      const data = await api<{ runs: BenchRun[]; leaderboard: LeaderboardRow[] }>("/api/benchloop/runs");
      setRuns(data.runs);
      setLeaderboard(data.leaderboard);
      setSelectedRunId((current) => current && data.runs.some((run) => run.id === current) ? current : (data.runs[0]?.id || ""));
    } finally {
      setLoadingRuns(false);
    }
  }

  async function loadModels() {
    setModelsLoading(true);
    setError(null);
    try {
      const data = await api<{ models: string[] }>(`/api/benchloop/models?provider=${encodeURIComponent(provider)}&endpoint=${encodeURIComponent(endpoint)}`);
      setModels(data.models);
      setModel((current) => current && data.models.includes(current) ? current : (data.models[0] || current));
    } catch (err) {
      setModels([]);
      setError(err instanceof Error ? err.message : "Failed to load models.");
    } finally {
      setModelsLoading(false);
    }
  }

  async function loadProfile() {
    setProfileLoading(true);
    try {
      const data = await api<UserProfile>("/api/auth/me");
      setUserProfile(data);
    } catch {
      setUserProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  async function generateApiKey() {
    try {
      const data = await api<{ api_key: string }>("/api/users/me/api-key", { method: "POST" });
      setUserProfile((prev) => prev ? { ...prev, api_key: data.api_key } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate API key.");
    }
  }

  async function revokeApiKey() {
    try {
      await api("/api/users/me/api-key", { method: "DELETE" });
      setUserProfile((prev) => prev ? { ...prev, api_key: undefined } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key.");
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadMeta(), loadRuns(), loadProfile()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load BenchLoop.");
      }
    })();
  }, []);

  useEffect(() => {
    void loadModels();
  }, [provider, endpoint]);

  useEffect(() => {
    if (!jobId) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await api<{ jobId: string; status: string; progress: any; error?: string; result?: BenchRun }>(`/api/benchloop/run-status/${jobId}`);
        setJobStatus(data.status);
        setJobProgress(data.progress);
        if (data.status === "completed") {
          window.clearInterval(interval);
          setJobId(null);
          await loadRuns();
          if (data.result?.id) setSelectedRunId(data.result.id);
        }
        if (data.status === "failed") {
          window.clearInterval(interval);
          setJobId(null);
          setError(data.error || "Benchmark failed.");
        }
      } catch (err) {
        window.clearInterval(interval);
        setJobId(null);
        setError(err instanceof Error ? err.message : "Failed to poll benchmark status.");
      }
    }, 1400);
    return () => window.clearInterval(interval);
  }, [jobId]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) || null, [runs, selectedRunId]);

  // Unique GPUs and families for filter dropdowns
  const uniqueGpus = useMemo(() => {
    return Array.from(new Set(leaderboard.map((row) => row.gpu).filter(Boolean)));
  }, [leaderboard]);
  const uniqueFamilies = useMemo(() => {
    return Array.from(new Set(leaderboard.map((row) => extractModelFamily(row.model))));
  }, [leaderboard]);

  // Determine if a row is "local" (all current data is local; cloud is future)
  const isRowLocal = (_row: LeaderboardRow) => true; // all data from /api/benchloop/runs is local

  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter((row) => {
      // Sub-tab filter (local/cloud)
      if (lbSubTab === "local" && !isRowLocal(row)) return false;
      if (lbSubTab === "cloud" && isRowLocal(row)) return false;
      // Text search
      if (search && !row.model.toLowerCase().includes(search.toLowerCase())) return false;
      if (harnessFilter !== "all" && row.harness !== harnessFilter) return false;
      if (providerFilter !== "all" && row.provider !== providerFilter) return false;
      // GPU filter
      if (gpuFilter !== "all" && row.gpu !== gpuFilter) return false;
      // Family filter
      if (familyFilter !== "all" && extractModelFamily(row.model) !== familyFilter) return false;
      return true;
    });
  }, [leaderboard, search, harnessFilter, providerFilter, lbSubTab, gpuFilter, familyFilter]);

  // Pagination
  const lbTotalPages = Math.max(1, Math.ceil(filteredLeaderboard.length / LB_PAGE_SIZE));
  const paginatedLeaderboard = useMemo(() => {
    const start = (lbPage - 1) * LB_PAGE_SIZE;
    return filteredLeaderboard.slice(start, start + LB_PAGE_SIZE);
  }, [filteredLeaderboard, lbPage]);

  // Compare: find best run per selected model from runs array
  const compareRuns = useMemo(() => {
    if (selectedCompare.size < 2) return [];
    const result: BenchRun[] = [];
    for (const modelName of selectedCompare) {
      const modelRuns = runs.filter((r) => r.model.model_id === modelName);
      if (modelRuns.length > 0) {
        const best = modelRuns.reduce((prev, curr) => curr.overall_score > prev.overall_score ? curr : prev);
        result.push(best);
      }
    }
    return result;
  }, [selectedCompare, runs]);

  function toggleCompareSelection(modelName: string) {
    setSelectedCompare((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) {
        next.delete(modelName);
      } else if (next.size < 5) {
        next.add(modelName);
      }
      return next;
    });
  }

  async function handleRunBenchmark() {
    if (!model) {
      setError("Choose a model before starting a benchmark.");
      return;
    }
    setError(null);
    setJobStatus("queued");
    setJobProgress({ phase: "queued", message: "Starting benchmark job" });
    const data = await api<{ jobId: string; status: string; progress: any }>("/api/benchloop/run/start", {
      method: "POST",
      body: JSON.stringify({
        model,
        endpoint,
        provider,
        harness,
        suites: selectedSuites,
      }),
    });
    setJobId(data.jobId);
    setJobStatus(data.status);
    setJobProgress(data.progress);
    setActiveTab("benchmark");
  }

  async function handleSendChat() {
    if (!chatInput.trim() || !model) return;
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: chatInput.trim() }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatBusy(true);
    setError(null);
    try {
      const data = await api<{ message: { role: "assistant"; content: string }; metrics: ChatMetric }>("/api/benchloop/chat", {
        method: "POST",
        body: JSON.stringify({
          model,
          endpoint,
          provider,
          harness,
          messages: nextMessages,
          maxTokens: 512,
          temperature: 0.2,
        }),
      });
      setChatMessages((current) => [...current, { role: "assistant", content: data.message.content, metrics: data.metrics }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed.");
    } finally {
      setChatBusy(false);
    }
  }

  async function handlePreviewSubmission(runId?: string) {
    setError(null);
    try {
      const data = await api<SubmissionPreview>("/api/benchloop/submission/preview", {
        method: "POST",
        body: JSON.stringify({ runId: runId || selectedRunId || null }),
      });
      setSubmissionPreview(data);
      setActiveTab("submit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview submission payload.");
    }
  }

  function toggleSuite(suite: string) {
    setSelectedSuites((current) => current.includes(suite) ? current.filter((item) => item !== suite) : [...current, suite]);
  }

  return (
    <div className="bench-app-shell">
      <aside className="bench-sidebar">
        <div className="brand-card">
          <div className="brand-mark">BL</div>
          <div>
            <div className="eyebrow">Local-first LLM benchmarking</div>
            <h1>BenchLoop</h1>
            <p>The fastest way to answer which model plus harness actually works best on your machine.</p>
          </div>
        </div>

        <div className="sidebar-section">
          <label className="field-label">Provider</label>
          <select value={provider} onChange={(event) => setProvider(event.target.value as ProviderId)}>
            {PROVIDERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <label className="field-label">Endpoint</label>
          <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="http://localhost:11434" />
          <button className="secondary-button" onClick={() => void loadModels()}>{modelsLoading ? "Refreshing..." : "Refresh models"}</button>
        </div>

        <nav className="tab-nav">
          {(Object.keys(TAB_COPY) as TabId[]).map((tab) => (
            <button key={tab} className={`tab-button ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
              <strong>{TAB_COPY[tab].label}</strong>
              <span>{TAB_COPY[tab].subtitle}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="eyebrow">v1 shipping suites</div>
          <div className="chip-row compact">
            {supportedSuites.map((suite) => <span className="chip" key={suite}>{suite}</span>)}
          </div>
        </div>
      </aside>

      <main className="bench-main">
        <header className="page-header">
          <div>
            <div className="eyebrow">{TAB_COPY[activeTab].label}</div>
            <h2>{TAB_COPY[activeTab].subtitle}</h2>
          </div>
          <div className="header-actions">
            <div className="header-model-pill">{model || "No model selected"}</div>
            <button className="primary-button" onClick={() => void handleRunBenchmark()} disabled={!model || !!jobId}>Run benchmark</button>
          </div>
        </header>

        {error ? <div className="banner error">{error}</div> : null}
        {jobId && jobProgress ? (
          <div className="banner progress">
            <strong>{jobProgress.phase || jobStatus}</strong>
            <span>{jobProgress.message || "Running benchmark"}</span>
            <span>{jobProgress.completedSuites ?? 0} / {jobProgress.totalSuites ?? selectedSuites.length} suites</span>
          </div>
        ) : null}

        <section className="page-content">
          {activeTab === "models" ? (
            <div className="content-grid two-up">
              <div className="panel">
                <div className="panel-header">
                  <h3>Endpoint models</h3>
                  <p>Pull directly from the selected provider endpoint. One click takes a model into Benchmark or Chat.</p>
                </div>
                <div className="list-stack">
                  {models.length === 0 ? <div className="empty-state">No models discovered yet.</div> : null}
                  {models.map((item) => (
                    <div className={`list-row ${item === model ? "selected" : ""}`} key={item}>
                      <div>
                        <div className="list-title">{item}</div>
                        <div className="list-subtitle">{provider} • {endpoint}</div>
                      </div>
                      <div className="row-actions">
                        <button className="secondary-button" onClick={() => { setModel(item); setActiveTab("chat"); }}>Chat</button>
                        <button className="primary-button" onClick={() => { setModel(item); setActiveTab("benchmark"); }}>Benchmark</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <h3>Why BenchLoop</h3>
                  <p>Hosted leaderboards miss the thing you actually care about: real local hardware, real provider endpoints, real harness behavior.</p>
                </div>
                <div className="marketing-stack">
                  <div className="callout-card">
                    <strong>Local benchmarks matter</strong>
                    <p>A model that wins in the cloud can still be unusable on your GPU, your endpoint stack, or your latency budget.</p>
                  </div>
                  <div className="callout-card">
                    <strong>Harness comparison matters</strong>
                    <p>The model is only half the story. BenchLoop is built to compare model plus harness on the same machine.</p>
                  </div>
                  <div className="callout-card">
                    <strong>CLI-first, app-visible</strong>
                    <p>Run from the CLI when you want repeatability, or use the app when you want readable progress, filters, and screenshotable results.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "benchmark" ? (
            <div className="content-grid benchmark-layout">
              <div className="panel config-panel">
                <div className="panel-header">
                  <h3>Run configuration</h3>
                  <p>Five real suites only. Coding and tool_use are intentionally deferred until they clear the quality bar.</p>
                </div>
                <label className="field-label">Model</label>
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  <option value="">Select a model</option>
                  {models.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <div className="field-grid">
                  <div>
                    <label className="field-label">Provider</label>
                    <input value={provider} readOnly />
                  </div>
                  <div>
                    <label className="field-label">Harness</label>
                    <select value={harness} onChange={(event) => setHarness(event.target.value)}>
                      {supportedHarnesses.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </div>
                <label className="field-label">Endpoint</label>
                <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
                <label className="field-label">Suites</label>
                <div className="suite-grid">
                  {supportedSuites.map((suite) => (
                    <label className={`suite-chip ${selectedSuites.includes(suite) ? "active" : ""}`} key={suite}>
                      <input type="checkbox" checked={selectedSuites.includes(suite)} onChange={() => toggleSuite(suite)} />
                      <span>{suite}</span>
                    </label>
                  ))}
                </div>
                <button className="primary-button wide" onClick={() => void handleRunBenchmark()} disabled={!model || !!jobId || selectedSuites.length === 0}>
                  {jobId ? "Benchmark running..." : "Start benchmark"}
                </button>
              </div>

              <div className="panel result-panel">
                <div className="panel-header split">
                  <div>
                    <h3>Run detail</h3>
                    <p>{selectedRun ? `${selectedRun.model.model_id} • ${selectedRun.provider} • ${selectedRun.harness}` : "Select or run a benchmark to inspect results."}</p>
                  </div>
                  {selectedRun ? <button className="secondary-button" onClick={() => void handlePreviewSubmission(selectedRun.id)}>Preview submission payload</button> : null}
                  {selectedRun ? (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        const tweetUrl = `${window.location.origin}/api/share/card/${selectedRun.id}`;
                        const text = encodeURIComponent(
                          `⚡ Benchmarked ${selectedRun.model.model_id}\n\nOverall: ${formatScore(selectedRun.overall_score)}/100\nQuality: ${formatScore(selectedRun.quality_score)}\nSpeed: ${selectedRun.speed_metrics.generation_tok_per_sec.toFixed(1)} tok/s\nGPU: ${selectedRun.machine.gpu || selectedRun.machine.machine_id}\n\n#BenchLoop #LLM #LocalAI`
                        );
                        window.open(`https://x.com/intent/tweet?text=${text}&url=${encodeURIComponent(tweetUrl)}`, "_blank");
                      }}
                    >
                      Share on 𝕏
                    </button>
                  ) : null}
                </div>

                {selectedRun ? (
                  <>
                    <div className="stat-grid">
                      <StatCard label="Overall" value={formatScore(selectedRun.overall_score)} detail="Weighted score" />
                      <StatCard label="Quality" value={formatScore(selectedRun.quality_score)} detail="Non-speed suites" />
                      <StatCard label="Speed" value={formatScore(selectedRun.speed_score)} detail={`${selectedRun.speed_metrics.generation_tok_per_sec.toFixed(1)} tok/s`} />
                      <StatCard label="Reliability" value={formatScore(selectedRun.reliability_score)} detail={`${formatSeconds(selectedRun.total_runtime_sec)} runtime`} />
                    </div>
                    <div className="meta-grid">
                      <div className="meta-card"><span>Machine</span><strong>{formatMachine(selectedRun)}</strong></div>
                      <div className="meta-card"><span>TTFT</span><strong>{selectedRun.speed_metrics.ttft_ms.toFixed(1)} ms</strong></div>
                      <div className="meta-card"><span>Prompt eval</span><strong>{selectedRun.speed_metrics.prompt_eval_tok_per_sec.toFixed(1)} tok/s</strong></div>
                      <div className="meta-card"><span>Completed</span><strong>{formatDate(selectedRun.timestamp)}</strong></div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Suite</th>
                            <th>Score</th>
                            <th>Pass</th>
                            <th>Fail</th>
                            <th>Median latency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(selectedRun.suites).map(([suiteName, suite]) => (
                            <tr key={suiteName}>
                              <td>{suiteName}</td>
                              <td><ScorePill value={suite.score} /></td>
                              <td>{suite.pass_count}</td>
                              <td>{suite.fail_count}</td>
                              <td>{suite.median_latency_ms.toFixed(1)} ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="run-list-inline">
                      <div className="eyebrow">Recent local runs</div>
                      <div className="list-stack compact-list">
                        {runs.slice(0, 8).map((run) => (
                          <button className={`mini-run-row ${run.id === selectedRunId ? "active" : ""}`} key={run.id} onClick={() => setSelectedRunId(run.id)}>
                            <span>{run.model.model_id}</span>
                            <span>{run.harness}</span>
                            <span>{formatScore(run.overall_score)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : <div className="empty-state">No runs yet. Start a benchmark from this page or pick a model from Models.</div>}
              </div>
            </div>
          ) : null}

          {activeTab === "leaderboard" ? (
            <div className="content-grid leaderboard-layout">
              <div className="panel filter-panel">
                <div className="panel-header">
                  <h3>Filters</h3>
                  <p>Ranked by best run per model + harness combination.</p>
                </div>

                {/* Local / Cloud sub-tabs */}
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <button
                    className={`secondary-button ${lbSubTab === "all" ? "active" : ""}`}
                    onClick={() => { setLbSubTab("all"); setLbPage(1); }}
                    style={{ flex: 1, fontSize: "0.8rem", padding: "6px 8px", fontWeight: lbSubTab === "all" ? 600 : 400, borderColor: lbSubTab === "all" ? "var(--accent, #22c55e)" : undefined }}
                  >
                    All ({leaderboard.length})
                  </button>
                  <button
                    className={`secondary-button ${lbSubTab === "local" ? "active" : ""}`}
                    onClick={() => { setLbSubTab("local"); setLbPage(1); }}
                    style={{ flex: 1, fontSize: "0.8rem", padding: "6px 8px", fontWeight: lbSubTab === "local" ? 600 : 400, borderColor: lbSubTab === "local" ? "var(--accent, #22c55e)" : undefined }}
                  >
                    Local ({leaderboard.filter(isRowLocal).length})
                  </button>
                  <button
                    className={`secondary-button ${lbSubTab === "cloud" ? "active" : ""}`}
                    onClick={() => { setLbSubTab("cloud"); setLbPage(1); }}
                    style={{ flex: 1, fontSize: "0.8rem", padding: "6px 8px", fontWeight: lbSubTab === "cloud" ? 600 : 400, borderColor: lbSubTab === "cloud" ? "var(--accent, #22c55e)" : undefined }}
                  >
                    Cloud ({leaderboard.filter((r) => !isRowLocal(r)).length})
                  </button>
                </div>

                <label className="field-label">Model search</label>
                <input value={search} onChange={(event) => { setSearch(event.target.value); setLbPage(1); }} placeholder="Search models" />
                <label className="field-label">Harness</label>
                <select value={harnessFilter} onChange={(event) => { setHarnessFilter(event.target.value); setLbPage(1); }}>
                  <option value="all">All harnesses</option>
                  {supportedHarnesses.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <label className="field-label">Provider</label>
                <select value={providerFilter} onChange={(event) => { setProviderFilter(event.target.value); setLbPage(1); }}>
                  <option value="all">All providers</option>
                  {Array.from(new Set(leaderboard.map((row) => row.provider))).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <label className="field-label">GPU</label>
                <select value={gpuFilter} onChange={(event) => { setGpuFilter(event.target.value); setLbPage(1); }}>
                  <option value="all">All GPUs ({uniqueGpus.length})</option>
                  {uniqueGpus.map((gpu) => <option key={gpu} value={gpu}>{gpu}</option>)}
                </select>
                <label className="field-label">Model Family</label>
                <select value={familyFilter} onChange={(event) => { setFamilyFilter(event.target.value); setLbPage(1); }}>
                  <option value="all">All families ({uniqueFamilies.length})</option>
                  {uniqueFamilies.map((fam) => <option key={fam} value={fam}>{fam}</option>)}
                </select>
                {(gpuFilter !== "all" || familyFilter !== "all" || harnessFilter !== "all" || providerFilter !== "all") ? (
                  <button className="secondary-button" style={{ marginTop: 8, fontSize: "0.8rem" }} onClick={() => { setGpuFilter("all"); setFamilyFilter("all"); setHarnessFilter("all"); setProviderFilter("all"); setSearch(""); setLbPage(1); }}>
                    Clear all filters
                  </button>
                ) : null}
              </div>
              <div className="panel">
                <div className="panel-header split">
                  <div>
                    <h3>Best on this machine</h3>
                    <p>{loadingRuns ? "Loading runs..." : `${filteredLeaderboard.length} ranked entries`}</p>
                  </div>
                  {selectedCompare.size >= 2 ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="primary-button" onClick={() => setShowCompare(true)}>
                        Compare {selectedCompare.size} Models
                      </button>
                      <button className="secondary-button" onClick={() => setSelectedCompare(new Set())}>
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Pagination info */}
                {filteredLeaderboard.length > LB_PAGE_SIZE ? (
                  <div style={{ textAlign: "center", marginBottom: 8, fontSize: "0.8rem", color: "var(--text-dim, #888)" }}>
                    Showing {(lbPage - 1) * LB_PAGE_SIZE + 1}-{Math.min(lbPage * LB_PAGE_SIZE, filteredLeaderboard.length)} of {filteredLeaderboard.length} models
                  </div>
                ) : null}

                {filteredLeaderboard.length === 0 ? <div className="empty-state">{lbSubTab === "cloud" ? "Cloud leaderboard coming soon. Run local benchmarks to see results here." : "No leaderboard entries match the current filters."}</div> : null}
                {paginatedLeaderboard.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}></th>
                          <th>#</th>
                          <th>Model</th>
                          <th>Quant</th>
                          <th>Harness</th>
                          <th>Provider</th>
                          <th>Overall</th>
                          <th>Quality</th>
                          <th>Speed</th>
                          <th>Tok/s</th>
                          <th>TTFT</th>
                          <th>GPU</th>
                          <th>Scope</th>
                          <th>Runtime</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedLeaderboard.map((row, idx) => (
                          <tr key={row.runId} className="clickable-row" onClick={() => { setSelectedRunId(row.runId); setActiveTab("benchmark"); }}>
                            <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={selectedCompare.has(row.model)}
                                onChange={() => toggleCompareSelection(row.model)}
                                style={{ cursor: "pointer" }}
                              />
                            </td>
                            <td>{(lbPage - 1) * LB_PAGE_SIZE + idx + 1}</td>
                            <td>{row.model}</td>
                            <td>{row.quantization || "-"}</td>
                            <td>{row.harness}</td>
                            <td>{row.provider}</td>
                            <td><ScorePill value={row.overall} /></td>
                            <td>{formatScore(row.quality)}</td>
                            <td>{formatScore(row.speed)}</td>
                            <td>{row.genTokPerSec ? row.genTokPerSec.toFixed(1) : "-"}</td>
                            <td>{row.ttftMs ? `${row.ttftMs.toFixed(0)} ms` : "-"}</td>
                            <td title={row.backend || row.gpu || row.machine}>{row.gpu || row.machine}</td>
                            <td>{row.isFullBenchmark ? `full (${row.suiteCount})` : `partial (${row.suiteCount})`}</td>
                            <td>{formatSeconds(row.runtimeSec)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {/* Pagination controls */}
                {lbTotalPages > 1 ? (
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12, alignItems: "center" }}>
                    <button className="secondary-button" onClick={() => setLbPage(Math.max(1, lbPage - 1))} disabled={lbPage === 1}>
                      Previous
                    </button>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-dim, #888)" }}>
                      Page {lbPage} of {lbTotalPages}
                    </span>
                    <button className="secondary-button" onClick={() => setLbPage(Math.min(lbTotalPages, lbPage + 1))} disabled={lbPage === lbTotalPages}>
                      Next
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Compare modal */}
              {showCompare && compareRuns.length >= 2 ? (
                <div
                  style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
                  onClick={() => setShowCompare(false)}
                >
                  <div
                    style={{ background: "var(--panel-bg, #1a1a2e)", borderRadius: 12, padding: 24, maxWidth: 1200, width: "100%", maxHeight: "90vh", overflow: "auto" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <h3 style={{ margin: 0 }}>Model Comparison</h3>
                      <button className="secondary-button" onClick={() => setShowCompare(false)} style={{ fontSize: "1.2rem" }}>x</button>
                    </div>
                    <div className="table-wrap">
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: 12 }}>Metric</th>
                            {compareRuns.map((run, i) => (
                              <th key={i} style={{ textAlign: "center", padding: 12, minWidth: 140 }}>
                                {run.model.model_id}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: 12, fontWeight: 600 }}>Overall</td>
                            {compareRuns.map((run, i) => <td key={i} style={{ textAlign: "center", padding: 12 }}><ScorePill value={run.overall_score} /></td>)}
                          </tr>
                          <tr>
                            <td style={{ padding: 12, fontWeight: 600 }}>Quality</td>
                            {compareRuns.map((run, i) => <td key={i} style={{ textAlign: "center", padding: 12 }}><ScorePill value={run.quality_score} /></td>)}
                          </tr>
                          <tr>
                            <td style={{ padding: 12, fontWeight: 600 }}>Speed</td>
                            {compareRuns.map((run, i) => <td key={i} style={{ textAlign: "center", padding: 12 }}><ScorePill value={run.speed_score} /></td>)}
                          </tr>
                          <tr>
                            <td style={{ padding: 12, fontWeight: 600 }}>Reliability</td>
                            {compareRuns.map((run, i) => <td key={i} style={{ textAlign: "center", padding: 12 }}><ScorePill value={run.reliability_score} /></td>)}
                          </tr>
                          {Object.keys(compareRuns[0]?.suites || {}).map((suiteName) => (
                            <tr key={suiteName}>
                              <td style={{ padding: 12, fontWeight: 600, textTransform: "capitalize" }}>{suiteName}</td>
                              {compareRuns.map((run, i) => {
                                const suite = run.suites[suiteName];
                                return <td key={i} style={{ textAlign: "center", padding: 12 }}>{suite ? <ScorePill value={suite.score} /> : "—"}</td>;
                              })}
                            </tr>
                          ))}
                          <tr>
                            <td style={{ padding: 12, fontWeight: 600 }}>Gen tok/s</td>
                            {compareRuns.map((run, i) => (
                              <td key={i} style={{ textAlign: "center", padding: 12, color: "var(--text-dim, #888)" }}>
                                {run.speed_metrics.generation_tok_per_sec.toFixed(1)}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td style={{ padding: 12, fontWeight: 600 }}>TTFT</td>
                            {compareRuns.map((run, i) => (
                              <td key={i} style={{ textAlign: "center", padding: 12, color: "var(--text-dim, #888)" }}>
                                {run.speed_metrics.ttft_ms.toFixed(0)} ms
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td style={{ padding: 12, fontWeight: 600 }}>GPU</td>
                            {compareRuns.map((run, i) => (
                              <td key={i} style={{ textAlign: "center", padding: 12, color: "var(--text-dim, #888)" }}>
                                {run.machine.gpu || run.machine.machine_id || "—"}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "chat" ? (
            <div className="content-grid chat-layout">
              <div className="panel chat-panel">
                <div className="panel-header split">
                  <div>
                    <h3>Quick model chat</h3>
                    <p>Use this for smoke tests, prompt sanity checks, and quick latency reads, not as a full chat product.</p>
                  </div>
                  <div className="chat-meta-pill">{provider} • {harness}</div>
                </div>
                <div className="chat-log" ref={chatScrollRef}>
                  {chatMessages.length === 0 ? <div className="empty-state">No chat yet. Send a message to test the selected model.</div> : null}
                  {chatMessages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}>
                      <div className="bubble-role">{message.role}</div>
                      <div className="bubble-content">{message.content}</div>
                      {message.metrics ? (
                        <div className="metric-row">
                          <span>{message.metrics.latencyMs.toFixed(1)} ms</span>
                          <span>{message.metrics.tokensPerSecond.toFixed(2)} tok/s</span>
                          <span>{message.metrics.promptTokens} in / {message.metrics.completionTokens} out</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="chat-compose">
                  <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask the selected model something..." />
                  <button className="primary-button" onClick={() => void handleSendChat()} disabled={chatBusy || !model || !chatInput.trim()}>
                    {chatBusy ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <h3>Active model</h3>
                  <p>Model, provider, and endpoint are shared across Models, Benchmark, and Chat for fast handoff.</p>
                </div>
                <div className="meta-grid stacked">
                  <div className="meta-card"><span>Model</span><strong>{model || "None selected"}</strong></div>
                  <div className="meta-card"><span>Provider</span><strong>{provider}</strong></div>
                  <div className="meta-card"><span>Endpoint</span><strong>{endpoint}</strong></div>
                  <div className="meta-card"><span>Harness</span><strong>{harness}</strong></div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "submit" ? (
            <div className="content-grid submit-layout">
              <div className="panel">
                <div className="panel-header split">
                  <div>
                    <h3>Submission contract</h3>
                    <p>Preview the canonical hosted leaderboard payload. Local paths, raw prompts, and raw outputs are excluded.</p>
                  </div>
                  <button className="secondary-button" onClick={() => void handlePreviewSubmission(selectedRunId)}>Refresh preview</button>
                </div>
                {submissionPreview ? <pre className="json-preview">{JSON.stringify(submissionPreview, null, 2)}</pre> : <div className="empty-state">Preview a run submission from Benchmark or use the button above.</div>}
              </div>
              <div className="panel">
                <div className="panel-header">
                  <h3>Privacy policy for hosted submission</h3>
                  <p>BenchLoop needs enough metadata to make results useful, but not enough to leak workstation internals.</p>
                </div>
                <div className="marketing-stack">
                  <div className="callout-card"><strong>Included</strong><p>Model, provider, harness, score summary, machine hardware summary, and runtime metrics.</p></div>
                  <div className="callout-card"><strong>Excluded</strong><p>Local filesystem paths, raw prompts, raw outputs, and anything that would expose private data by default.</p></div>
                  <div className="callout-card"><strong>Versioned</strong><p>The payload ships with an explicit schema version so the hosted backend can evolve without guesswork.</p></div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "profile" ? (
            <div className="content-grid profile-layout">
              <div className="panel">
                <div className="panel-header">
                  <h3>Your Profile</h3>
                  <p>Connect with GitHub or X to track your benchmarks on the public leaderboard.</p>
                </div>

                {profileLoading ? (
                  <div className="empty-state">Loading profile...</div>
                ) : userProfile ? (
                  <div className="profile-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                      {userProfile.avatar_url ? (
                        <img src={userProfile.avatar_url} alt="" style={{ width: 64, height: 64, borderRadius: "50%" }} />
                      ) : null}
                      <div>
                        <div style={{ fontSize: "1.2rem", fontWeight: 600, color: "#fff" }}>{userProfile.name || userProfile.login}</div>
                        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>@{userProfile.login}</div>
                        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>{userProfile.run_count} benchmarks</div>
                      </div>
                    </div>
                    {userProfile.bio ? <p style={{ color: "var(--text-dim)", marginBottom: 12 }}>{userProfile.bio}</p> : null}
                    <div className="meta-grid stacked">
                      {userProfile.html_url ? <div className="meta-card"><span>Profile</span><a href={userProfile.html_url} target="_blank" rel="noopener">{userProfile.html_url}</a></div> : null}
                      {userProfile.x_handle ? <div className="meta-card"><span>X</span><strong>@{userProfile.x_handle}</strong></div> : null}
                      {userProfile.github_username ? <div className="meta-card"><span>GitHub</span><strong>{userProfile.github_username}</strong></div> : null}
                    </div>
                    <button className="secondary-button" style={{ marginTop: 12 }} onClick={() => { setUserProfile(null); }}>
                      Log out
                    </button>
                  </div>
                ) : (
                  <div className="marketing-stack">
                    <div className="callout-card">
                      <strong>Connect with GitHub</strong>
                      <p>Link your GitHub account to get a profile, API key, and public leaderboard ranking.</p>
                      <button className="primary-button" style={{ marginTop: 8 }} onClick={() => { window.location.href = "/api/auth/github"; }}>
                        Sign in with GitHub
                      </button>
                    </div>
                    <div className="callout-card">
                      <strong>Connect with X</strong>
                      <p>Use your X (Twitter) account instead. Your handle appears on share cards.</p>
                      <button className="primary-button" style={{ marginTop: 8 }} onClick={() => { window.location.href = "/api/auth/x"; }}>
                        Sign in with X
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>API Key</h3>
                  <p>Use this key with the CLI to link benchmarks to your profile: <code>benchloop run --api-key YOUR_KEY</code></p>
                </div>

                {userProfile?.api_key ? (
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                      <code style={{ flex: 1, padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.8rem", wordBreak: "break-all" }}>
                        {userProfile.api_key}
                      </code>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          navigator.clipboard.writeText(userProfile.api_key || "");
                          setApiKeyCopied(true);
                          window.setTimeout(() => setApiKeyCopied(false), 2000);
                        }}
                      >
                        {apiKeyCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <button className="secondary-button" onClick={() => void revokeApiKey()}>Revoke key</button>
                  </div>
                ) : userProfile ? (
                  <button className="primary-button" onClick={() => void generateApiKey()}>Generate API Key</button>
                ) : (
                  <div className="empty-state">Sign in to generate an API key.</div>
                )}

                <div className="marketing-stack" style={{ marginTop: 24 }}>
                  <div className="callout-card">
                    <strong>My Runs</strong>
                    <p>Your benchmark history linked to your profile.</p>
                  </div>
                  <div className="list-stack compact-list">
                    {runs.filter((r: any) => r.user_id === userProfile?.id).length === 0 ? (
                      <div className="empty-state">No runs linked to your profile yet.</div>
                    ) : (
                      runs.filter((r: any) => r.user_id === userProfile?.id).slice(0, 10).map((run) => (
                        <button className={`mini-run-row ${run.id === selectedRunId ? "active" : ""}`} key={run.id} onClick={() => { setSelectedRunId(run.id); setActiveTab("benchmark"); }}>
                          <span>{run.model.model_id}</span>
                          <span>{run.harness}</span>
                          <span>{formatScore(run.overall_score)}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
