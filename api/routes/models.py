"""Model listing — auto-detects local providers (Ollama, LM Studio, oMLX, etc.) and supports remote endpoints."""
from __future__ import annotations

import asyncio
import contextlib
import json
import time

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx

try:
    from sse_starlette.sse import EventSourceResponse
except Exception:  # pragma: no cover
    EventSourceResponse = None

router = APIRouter()

# Active pull tracking
_active_pulls: dict[str, dict] = {}
_pull_subscribers: dict[str, list[asyncio.Queue]] = {}
_PULL_RETENTION_SECONDS = 300


class PullRequest(BaseModel):
    model: str
    endpoint: str = "http://localhost:11434"


# Common local provider endpoints to probe
KNOWN_PROVIDERS = [
    {"name": "ollama", "url": "http://localhost:11434", "type": "ollama", "label": "Ollama (local)"},
    {"name": "lm-studio", "url": "http://localhost:1234", "type": "openai", "label": "LM Studio (local)"},
    {"name": "omlx", "url": "http://localhost:8000", "type": "openai", "label": "oMLX (local)"},
    {"name": "jan", "url": "http://localhost:1337", "type": "openai", "label": "Jan / Atomic Chat (local)"},
    {"name": "vllm", "url": "http://localhost:8080", "type": "openai", "label": "vLLM (local)"},
]


async def _fetch_ollama_models(endpoint: str) -> list[dict]:
    """Fetch models from an Ollama-style endpoint."""
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(f"{endpoint.rstrip('/')}/api/tags")
        resp.raise_for_status()
    raw = resp.json().get("models", [])
    models = []
    for m in raw:
        name = m.get("name", "")
        details = m.get("details", {})
        size_bytes = m.get("size", 0)
        size_gb = round(size_bytes / (1024**3), 1) if size_bytes else None
        models.append({
            "name": name,
            "size_gb": size_gb,
            "quantization": details.get("quantization_level", ""),
            "family": details.get("family", ""),
            "parameter_size": details.get("parameter_size", ""),
            "format": details.get("format", ""),
        })
    return models


async def _fetch_openai_models(endpoint: str) -> list[dict]:
    """Fetch models from an OpenAI-compatible endpoint."""
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(f"{endpoint.rstrip('/')}/v1/models")
        resp.raise_for_status()
    raw = resp.json().get("data", [])
    return [
        {
            "name": m.get("id", ""),
            "size_gb": None,
            "quantization": "",
            "family": "",
            "parameter_size": "",
            "format": "",
        }
        for m in raw
        if m.get("id")
    ]


async def _probe_provider(provider: dict) -> dict | None:
    """Check if a provider is reachable and return its info + models."""
    try:
        if provider["type"] == "ollama":
            models = await _fetch_ollama_models(provider["url"])
        else:
            models = await _fetch_openai_models(provider["url"])
        return {
            "name": provider["name"],
            "label": provider["label"],
            "url": provider["url"],
            "type": provider["type"],
            "available": True,
            "model_count": len(models),
            "models": models,
        }
    except Exception:
        return None


@router.get("/models")
async def list_models(endpoint: str = Query(default="")):
    """List models. If endpoint specified, query that. Otherwise auto-detect local providers."""
    if endpoint:
        try:
            models = await _fetch_ollama_models(endpoint)
            return {
                "providers": [{
                    "name": "custom",
                    "label": f"Custom ({endpoint})",
                    "url": endpoint,
                    "type": "ollama",
                    "available": True,
                    "model_count": len(models),
                    "models": models,
                }],
                "total_models": len(models),
            }
        except Exception:
            try:
                models = await _fetch_openai_models(endpoint)
                return {
                    "providers": [{
                        "name": "custom",
                        "label": f"Custom ({endpoint})",
                        "url": endpoint,
                        "type": "openai",
                        "available": True,
                        "model_count": len(models),
                        "models": models,
                    }],
                    "total_models": len(models),
                }
            except Exception as exc:
                return {
                    "providers": [],
                    "total_models": 0,
                    "error": f"Could not connect to {endpoint}: {exc}",
                }

    detected = []
    for provider in KNOWN_PROVIDERS:
        result = await _probe_provider(provider)
        if result:
            detected.append(result)

    total = sum(p["model_count"] for p in detected)
    return {
        "providers": detected,
        "total_models": total,
    }


@router.get("/models/search-hf")
async def search_huggingface(
    query: str = Query(default=""),
    limit: int = Query(default=20),
    page: int = Query(default=1),
    format_filter: str = Query(default="", alias="format"),
):
    """Search HuggingFace for trending/popular models with filtering and pagination."""
    try:
        fetch_limit = limit * 3 if format_filter else limit
        offset = (page - 1) * limit

        async with httpx.AsyncClient(timeout=10) as client:
            params = {
                "sort": "trendingScore" if not query else "downloads",
                "direction": "-1",
                "limit": fetch_limit + offset,
                "pipeline_tag": "text-generation",
            }
            if query:
                params["search"] = query
            resp = await client.get("https://huggingface.co/api/models", params=params)
            resp.raise_for_status()

        format_keywords = {
            "gguf": ["gguf"],
            "mlx": ["mlx"],
            "gptq": ["gptq"],
            "awq": ["awq"],
            "fp16": ["fp16", "float16"],
            "fp8": ["fp8"],
            "bf16": ["bf16", "bfloat16"],
        }

        models = []
        for m in resp.json():
            model_id = m.get("id", "")
            if not model_id or "/" not in model_id:
                continue
            downloads = m.get("downloads", 0)
            likes = m.get("likes", 0)
            tags = m.get("tags", [])
            pipeline_tag = m.get("pipeline_tag", "")
            author = model_id.split("/")[0]
            model_name = model_id.split("/")[-1]

            detected_formats = []
            searchable = " ".join(tags + [model_name]).lower()
            for fmt, keywords in format_keywords.items():
                if any(kw in searchable for kw in keywords):
                    detected_formats.append(fmt)
            if not detected_formats:
                detected_formats.append("safetensors")

            if format_filter and format_filter.lower() not in [f.lower() for f in detected_formats]:
                continue

            models.append({
                "id": model_id,
                "author": author,
                "name": model_name,
                "avatar_url": f"https://huggingface.co/api/organizations/{author}/avatar",
                "downloads": downloads,
                "likes": likes,
                "pipeline_tag": pipeline_tag,
                "tags": tags[:15],
                "formats": detected_formats,
                "url": f"https://huggingface.co/{model_id}",
                "created_at": m.get("createdAt", ""),
            })

        total = len(models)
        page_models = models[offset:offset + limit]

        return {
            "query": query,
            "format_filter": format_filter,
            "models": page_models,
            "count": len(page_models),
            "total": total,
            "page": page,
            "pages": (total + limit - 1) // limit if total > 0 else 1,
        }
    except Exception as exc:
        return {
            "query": query,
            "models": [],
            "count": 0,
            "total": 0,
            "page": 1,
            "pages": 1,
            "error": str(exc),
        }


def _is_pull_done(info: dict | None) -> bool:
    return bool(info and info.get("done"))


async def _broadcast_pull_update(pull_id: str) -> None:
    info = _active_pulls.get(pull_id)
    if not info:
        return
    for queue in list(_pull_subscribers.get(pull_id, [])):
        with contextlib.suppress(asyncio.QueueFull):
            queue.put_nowait(dict(info))


async def _cleanup_pull_after_delay(pull_id: str, delay: int = _PULL_RETENTION_SECONDS) -> None:
    await asyncio.sleep(delay)
    _active_pulls.pop(pull_id, None)
    _pull_subscribers.pop(pull_id, None)


async def _do_pull(pull_id: str, model_name: str, endpoint: str):
    """Background task: pull model from Ollama and update _active_pulls."""
    info = _active_pulls[pull_id]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=None, write=30, pool=30)) as client:
            async with client.stream(
                "POST",
                f"{endpoint.rstrip('/')}/api/pull",
                json={"name": model_name, "stream": True},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    status = chunk.get("status") or info.get("status") or "pulling"
                    completed = chunk.get("completed")
                    total = chunk.get("total")
                    progress = info.get("progress", 0)

                    if isinstance(completed, (int, float)) and isinstance(total, (int, float)) and total > 0:
                        progress = round((completed / total) * 100, 1)
                    elif status == "success":
                        progress = 100

                    info.update({
                        "status": status,
                        "progress": max(0, min(progress, 100)),
                        "completed": completed,
                        "total": total,
                        "digest": chunk.get("digest"),
                        "error": chunk.get("error"),
                        "done": status == "success" or bool(chunk.get("error")),
                        "updated_at": time.time(),
                    })

                    if info["done"]:
                        info["finished_at"] = time.time()
                        if chunk.get("error"):
                            info["status"] = "error"

                    await _broadcast_pull_update(pull_id)

        if not info.get("done"):
            info.update({
                "status": "success",
                "progress": 100,
                "done": True,
                "updated_at": time.time(),
                "finished_at": time.time(),
            })
            await _broadcast_pull_update(pull_id)
    except Exception as exc:
        info.update({
            "status": "error",
            "error": str(exc),
            "done": True,
            "updated_at": time.time(),
            "finished_at": time.time(),
        })
        await _broadcast_pull_update(pull_id)
    finally:
        asyncio.create_task(_cleanup_pull_after_delay(pull_id))


@router.post("/models/pull")
async def pull_model(body: PullRequest):
    """Start pulling a model via Ollama. Returns pull_id for tracking."""
    model_name = body.model.strip()
    endpoint = body.endpoint.strip().rstrip("/")
    if not model_name:
        return {"error": "model name required"}

    pull_id = f"pull-{int(time.time())}-{model_name.replace('/', '-').replace(':', '-')}"
    _active_pulls[pull_id] = {
        "pull_id": pull_id,
        "model": model_name,
        "endpoint": endpoint,
        "status": "starting",
        "progress": 0,
        "completed": 0,
        "total": 0,
        "digest": None,
        "error": None,
        "done": False,
        "started_at": time.time(),
        "updated_at": time.time(),
    }
    asyncio.create_task(_do_pull(pull_id, model_name, endpoint))
    return {"pull_id": pull_id, "model": model_name}


@router.get("/models/pull/active")
async def active_pulls():
    """List all active and recent pulls."""
    now = time.time()
    stale = [
        key for key, value in _active_pulls.items()
        if value.get("done") and value.get("finished_at") and now - value["finished_at"] > _PULL_RETENTION_SECONDS
    ]
    for key in stale:
        _active_pulls.pop(key, None)
        _pull_subscribers.pop(key, None)
    pulls = sorted(_active_pulls.values(), key=lambda item: item.get("started_at", 0), reverse=True)
    return {"pulls": pulls}


@router.get("/models/pull/{pull_id}")
async def pull_status(pull_id: str):
    """Get status of a specific pull."""
    info = _active_pulls.get(pull_id)
    if not info:
        return {"error": "unknown pull_id"}
    return info


async def _sse_event_generator(pull_id: str, request: Request):
    info = _active_pulls.get(pull_id)
    if not info:
        yield {"event": "error", "data": json.dumps({"error": "unknown pull_id"})}
        return

    queue: asyncio.Queue = asyncio.Queue(maxsize=20)
    _pull_subscribers.setdefault(pull_id, []).append(queue)
    try:
        yield {"event": "pull", "data": json.dumps(dict(info))}
        while True:
            if await request.is_disconnected():
                break
            if _is_pull_done(_active_pulls.get(pull_id)) and queue.empty():
                final_info = _active_pulls.get(pull_id)
                if final_info:
                    yield {"event": "pull", "data": json.dumps(dict(final_info))}
                break
            try:
                update = await asyncio.wait_for(queue.get(), timeout=15)
                yield {"event": "pull", "data": json.dumps(update)}
            except asyncio.TimeoutError:
                heartbeat = _active_pulls.get(pull_id)
                if heartbeat:
                    yield {"event": "ping", "data": json.dumps({"pull_id": pull_id, "status": heartbeat.get("status")})}
                else:
                    break
    finally:
        subscribers = _pull_subscribers.get(pull_id, [])
        with contextlib.suppress(ValueError):
            subscribers.remove(queue)
        if not subscribers:
            _pull_subscribers.pop(pull_id, None)


@router.get("/models/pull/{pull_id}/stream")
async def pull_stream(pull_id: str, request: Request):
    """SSE stream of pull progress."""
    if pull_id not in _active_pulls:
        return {"error": "unknown pull_id"}

    if EventSourceResponse:
        return EventSourceResponse(_sse_event_generator(pull_id, request))

    async def plain_stream():
        async for event in _sse_event_generator(pull_id, request):
            yield f"event: {event['event']}\ndata: {event['data']}\n\n"

    return StreamingResponse(plain_stream(), media_type="text/event-stream")


@router.get('/models/hf-details')
async def hf_model_details(repo: str = Query(...)):
    """Fetch detailed HF repo info including GGUF file sizes for fit checks."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            detail_resp = await client.get(f'https://huggingface.co/api/models/{repo}')
            detail_resp.raise_for_status()
            tree_resp = await client.get(f'https://huggingface.co/api/models/{repo}/tree/main')
            tree_resp.raise_for_status()

        detail = detail_resp.json()
        files = tree_resp.json()

        gguf_files = []
        total_size = 0
        for f in files:
            path = f.get('path', '')
            size = f.get('size') or 0
            if path.lower().endswith('.gguf'):
                gguf_files.append({
                    'path': path,
                    'size_bytes': size,
                    'size_gb': round(size / (1024**3), 2) if size else None,
                })
                total_size += size

        largest = max(gguf_files, key=lambda x: x.get('size_bytes') or 0) if gguf_files else None

        return {
            'repo': repo,
            'id': detail.get('id', repo),
            'downloads': detail.get('downloads', 0),
            'likes': detail.get('likes', 0),
            'tags': detail.get('tags', []),
            'cardData': detail.get('cardData', {}),
            'gguf_files': gguf_files,
            'largest_gguf': largest,
            'total_gguf_size_gb': round(total_size / (1024**3), 2) if total_size else None,
        }
    except Exception as exc:
        return {
            'repo': repo,
            'error': str(exc),
            'gguf_files': [],
            'largest_gguf': None,
            'total_gguf_size_gb': None,
        }
