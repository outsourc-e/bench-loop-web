import { adminClient, bearer, json, postOnly, preflight, requestJson, safeMessage, sha256 } from "../_shared/http.ts";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

Deno.serve(async (req: Request) => {
  const early = preflight(req) || postOnly(req);
  if (early) return early;

  try {
    const token = bearer(req);
    if (!token || !/^blr_[A-Za-z0-9_-]{40,60}$/.test(token)) return json({ error: "invalid_runner_token" }, 401);
    const body = await requestJson(req);
    const run = object(body.run);
    const visibility = String(body.visibility || "public");
    const createPost = body.create_post !== false;
    if (!["public", "unlisted", "private"].includes(visibility)) return json({ error: "invalid_visibility" }, 400);

    const manifestHash = String(run.manifest_hash || "");
    const sourceRunId = String(run.source_run_id || "");
    const capturedAt = String(run.timestamp || "");
    if (!/^sha256:[a-fA-F0-9]{64}$/.test(manifestHash) || !sourceRunId || sourceRunId.length > 240 || Number.isNaN(Date.parse(capturedAt))) {
      return json({ error: "invalid_run_provenance" }, 400);
    }
    for (const field of ["benchmark_id", "benchmark_version", "benchmark_profile", "score_schema_version"] as const) {
      if (!String(run[field] || "").trim()) return json({ error: `missing_${field}` }, 400);
    }

    const supabase = adminClient();
    const tokenHash = await sha256(token);
    const { data: device, error: deviceError } = await supabase
      .from("runner_devices")
      .select("id, owner_id, name")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (deviceError) throw deviceError;
    if (!device) return json({ error: "invalid_runner_token" }, 401);

    const { data: existing } = await supabase
      .from("runs")
      .select("id")
      .eq("owner_id", device.owner_id)
      .eq("source_run_id", sourceRunId)
      .maybeSingle();
    if (existing) {
      const site = (Deno.env.get("BENCHLOOP_SITE_URL") || "https://bench-loop.com").replace(/\/$/, "");
      return json({ run_id: existing.id, url: `${site}/runs`, deduplicated: true });
    }

    const machine = object(run.machine);
    const model = object(run.model);
    const hardwareLabel = String(machine.hardware_label || machine.gpu || machine.cpu || device.name).slice(0, 240);
    const rigName = String(device.name || hardwareLabel).slice(0, 80) || "BenchLoop Runner";
    const { data: rig, error: rigError } = await supabase
      .from("rigs")
      .upsert({
        owner_id: device.owner_id,
        name: rigName,
        hardware_label: hardwareLabel,
        cpu: String(machine.cpu || "") || null,
        gpu: String(machine.gpu || "") || null,
        system_memory_gb: number(machine.system_memory_gb) || null,
        gpu_memory_gb: number(machine.gpu_memory_gb) || null,
        operating_system: String(machine.os || "") || null,
        visibility,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "owner_id,name" })
      .select("id")
      .single();
    if (rigError) throw rigError;

    const metrics = {
      overall_score: number(run.overall_score),
      quality_score: number(run.quality_score),
      speed_score: number(run.speed_score),
      reliability_score: number(run.reliability_score),
      value_score: number(run.value_score),
      coverage_score: number(run.coverage_score),
      comparable: Boolean(run.comparable),
      speed_metrics: object(run.speed_metrics),
    };
    const environment = {
      machine,
      model,
      provider: String(run.provider || ""),
      harness: String(run.harness || ""),
      harness_version: String(run.harness_version || ""),
    };
    const { data: insertedRun, error: runError } = await supabase
      .from("runs")
      .insert({
        owner_id: device.owner_id,
        rig_id: rig.id,
        source_run_id: sourceRunId,
        benchmark_id: String(run.benchmark_id),
        benchmark_version: String(run.benchmark_version),
        benchmark_profile: String(run.benchmark_profile),
        score_schema_version: String(run.score_schema_version),
        manifest_hash: manifestHash,
        status: "completed",
        verification_level: "captured",
        metrics,
        suites: object(run.suites),
        environment,
        visibility,
        captured_at: new Date(capturedAt).toISOString(),
      })
      .select("id")
      .single();
    if (runError) {
      if (runError.code === "23505") {
        const { data: racedRun } = await supabase
          .from("runs")
          .select("id")
          .eq("owner_id", device.owner_id)
          .eq("source_run_id", sourceRunId)
          .maybeSingle();
        if (racedRun) {
          const site = (Deno.env.get("BENCHLOOP_SITE_URL") || "https://bench-loop.com").replace(/\/$/, "");
          return json({ run_id: racedRun.id, url: `${site}/runs`, deduplicated: true });
        }
      }
      throw runError;
    }

    let postId: number | null = null;
    if (createPost) {
      const modelId = String(model.model_id || "Local model").slice(0, 120);
      const tokPerSec = number(object(run.speed_metrics).generation_tok_per_sec);
      const summary = `${modelId} scored ${metrics.overall_score.toFixed(1)} overall on ${hardwareLabel}${tokPerSec ? ` at ${tokPerSec.toFixed(1)} tok/s` : ""}. Captured with BenchLoop ${String(run.benchmark_version)}.`;
      const { data: post, error: postError } = await supabase
        .from("posts")
        .insert({
          author_id: device.owner_id,
          run_id: insertedRun.id,
          title: `${modelId} on ${hardwareLabel}`.slice(0, 180),
          body: summary,
          visibility,
        })
        .select("id")
        .single();
      if (postError) throw postError;
      postId = post.id;
    }

    await supabase.from("runner_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
    const site = (Deno.env.get("BENCHLOOP_SITE_URL") || "https://bench-loop.com").replace(/\/$/, "");
    return json({
      run_id: insertedRun.id,
      post_id: postId,
      url: postId ? `${site}/posts/${postId}` : `${site}/runs`,
    }, 201);
  } catch (error) {
    console.error("runs-publish", safeMessage(error));
    return json({ error: "run_publish_failed" }, 500);
  }
});
