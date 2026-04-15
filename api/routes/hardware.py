"""Hardware detection endpoint."""
from __future__ import annotations

from fastapi import APIRouter

from bench_loop.hardware import detect_hardware

router = APIRouter()


@router.get("/hardware")
async def get_hardware():
    hw = detect_hardware()
    return hw.to_dict()
