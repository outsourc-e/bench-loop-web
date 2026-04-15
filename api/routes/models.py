"""Model listing — auto-detects local providers (Ollama, LM Studio, oMLX, etc.) and supports remote endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Query
import httpx

router = APIRouter()

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
        if models or True:  # Even 0 models = provider is reachable
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
    
    # If explicit endpoint given, try it directly
    if endpoint:
        try:
            # Try Ollama first
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

    # Auto-detect: probe all known providers
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
        # Fetch more than needed so we can filter client-side
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
        
        FORMAT_KEYWORDS = {
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
            
            # Detect formats from tags + model name
            detected_formats = []
            searchable = " ".join(tags + [model_name]).lower()
            for fmt, keywords in FORMAT_KEYWORDS.items():
                if any(kw in searchable for kw in keywords):
                    detected_formats.append(fmt)
            if not detected_formats:
                detected_formats.append("safetensors")
            
            # Apply format filter
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
        
        # Paginate
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
