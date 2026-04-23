"""Benchmark run management — kick off, stream, list, detail."""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path as FsPath
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from bench_loop.config import RunConfig
from bench_loop.runner.orchestrator import run_benchmark
from bench_loop.models import BenchmarkRun

router = APIRouter()

RUNS_DIR = FsPath("~/.bench-loop/runs").expanduser()

# In-memory state for active runs
_active_runs: dict[str, dict[str, Any]] = {}


class BenchmarkRequest(BaseModel):
    model: str
    endpoint: str = "http://localhost:11434"
    provider: str = "ollama"
    suites: list[str] = Field(default_factory=lambda: ["speed", "toolcall", "dataextract", "instructfollow", "reasonmath"])
    harness: str = "raw"
    runs: int = 3
    timeout_sec: float = 300.0


@router.post("/benchmark/run")
async def start_benchmark_route(req: BenchmarkRequest):
    run_id = str(uuid.uuid4())[:8]
    config = RunConfig(
        model=req.model,
        provider=req.provider,
        endpoint=req.endpoint,
        harness=req.harness,
        suite_names=req.suites,
        runs=req.runs,
        timeout_sec=req.timeout_sec,
    )

    _active_runs[run_id] = {
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "model": req.model,
            "endpoint": req.endpoint,
            "suites": req.suites,
            "harness": req.harness,
        },
        "events": [],
        "result": None,
        "error": None,
    }

    def on_progress(event: dict[str, Any]) -> None:
        _active_runs[run_id]["events"].append(event)

    async def _run():
        try:
            result = await run_benchmark(config, on_progress=on_progress)
            _active_runs[run_id]["status"] = "completed"
            _active_runs[run_id]["result"] = result.to_dict()
        except Exception as exc:
            _active_runs[run_id]["status"] = "failed"
            _active_runs[run_id]["error"] = str(exc)
            _active_runs[run_id]["events"].append({
                "type": "run_failed",
                "error": str(exc),
            })

    asyncio.create_task(_run())
    return {"run_id": run_id, "status": "started"}


@router.get("/benchmark/stream/{run_id}")
async def stream_benchmark(run_id: str):
    """SSE stream for benchmark progress — emits granular task-level events."""
    async def event_generator():
        if run_id not in _active_runs:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Run not found'})}\n\n"
            return

        last_idx = 0
        while True:
            run_state = _active_runs.get(run_id)
            if not run_state:
                break

            events = run_state["events"]
            while last_idx < len(events):
                yield f"data: {json.dumps(events[last_idx])}\n\n"
                last_idx += 1

            if run_state["status"] in ("completed", "failed"):
                yield f"data: {json.dumps({'type': 'done', 'status': run_state['status']})}\n\n"
                break

            await asyncio.sleep(0.3)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/benchmark/runs")
async def list_runs(limit: int = Query(default=50, le=200)):
    """List past benchmark runs from disk."""
    if not RUNS_DIR.exists():
        return {"runs": []}

    runs = []
    dirs = sorted(RUNS_DIR.iterdir(), reverse=True)
    for d in dirs[:limit]:
        run_file = d / "run.json"
        if not run_file.exists():
            continue
        try:
            data = json.loads(run_file.read_text())
            machine = data.get("machine", {}) or {}
            speed_metrics = data.get("speed_metrics", {}) or {}
            runs.append({
                "id": d.name,
                "timestamp": data.get("timestamp", ""),
                "model": data.get("model", {}).get("model_id", "unknown"),
                "overall_score": data.get("overall_score", 0),
                "quality_score": data.get("quality_score", 0),
                "speed_score": data.get("speed_score", 0),
                "reliability_score": data.get("reliability_score", 0),
                "value_score": data.get("value_score", 0),
                "total_runtime_sec": data.get("total_runtime_sec", 0),
                "harness": data.get("harness", "raw"),
                "suites": {
                    name: {
                        "score": s.get("score", 0),
                        "pass_count": s.get("pass_count", 0),
                        "task_count": s.get("task_count", 0),
                    }
                    for name, s in data.get("suites", {}).items()
                },
                "provider": data.get("provider", ""),
                "machine": machine.get("machine_id", ""),
                "gpu": machine.get("gpu", ""),
                "gpu_memory_gb": machine.get("gpu_memory_gb", 0),
                "cpu": machine.get("cpu", ""),
                "system_memory_gb": machine.get("system_memory_gb", 0),
                "os": machine.get("os", ""),
                "generation_tok_per_sec": speed_metrics.get("generation_tok_per_sec", 0),
                "prompt_eval_tok_per_sec": speed_metrics.get("prompt_eval_tok_per_sec", 0),
                "ttft_ms": speed_metrics.get("ttft_ms", 0),
            })
        except Exception:
            continue

    return {"runs": runs}


@router.get("/benchmark/runs/{run_id}")
async def get_run(run_id: str):
    """Get detailed run result."""
    # Check active runs first
    if run_id in _active_runs:
        return _active_runs[run_id]

    # Check disk
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        return {"error": "Run not found"}

    run_file = run_dir / "run.json"
    if not run_file.exists():
        return {"error": "Run data missing"}

    data = json.loads(run_file.read_text())

    hw_file = run_dir / "hardware.json"
    hw_data = None
    if hw_file.exists():
        hw_data = json.loads(hw_file.read_text())

    return {
        "status": "completed",
        "result": data,
        "hardware": hw_data,
    }
