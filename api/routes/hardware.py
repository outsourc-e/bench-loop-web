"""Hardware detection endpoint."""
from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter

from bench_loop.hardware import detect_hardware

router = APIRouter()


@router.get("/hardware")
async def get_hardware():
    hw = detect_hardware()
    data = hw.to_dict()
    usage = shutil.disk_usage(Path.home())
    data["disk_total_gb"] = round(usage.total / (1024**3), 1)
    data["disk_free_gb"] = round(usage.free / (1024**3), 1)
    return data
