"""Health check endpoint."""
from __future__ import annotations

from fastapi import APIRouter

import bench_loop
from bench_loop.hardware import detect_hardware

router = APIRouter()


@router.get("/health")
async def health():
    hw = detect_hardware()
    return {
        "status": "ok",
        "version": bench_loop.__version__,
        "hardware": {
            "cpu": hw.cpu_model,
            "gpu": hw.gpu.model,
            "memory_gb": round(hw.memory_total_mb / 1024, 1),
        },
    }
