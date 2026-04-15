"""BenchLoop API — FastAPI backend for local LLM benchmarking."""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure bench-loop package is importable
bench_loop_root = Path(__file__).resolve().parent.parent.parent / "bench-loop"
if str(bench_loop_root) not in sys.path:
    sys.path.insert(0, str(bench_loop_root))

# Ensure api package root is importable for routes
api_root = Path(__file__).resolve().parent
if str(api_root) not in sys.path:
    sys.path.insert(0, str(api_root))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import benchmark, hardware, health, models

app = FastAPI(title="BenchLoop", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(benchmark.router, prefix="/api")
app.include_router(hardware.router, prefix="/api")
