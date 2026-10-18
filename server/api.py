"""
Droply - FastAPI Server & WebSocket Bridge
Provides REST endpoints and real-time WebSocket broadcasting.
"""

import os
import re
import sys
import time
import json
import secrets
import asyncio
import threading
import tempfile
import subprocess
import urllib.request
from pathlib import Path
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager
from pydantic import BaseModel, Field

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse

# Priority import path for self-updated yt-dlp core engine
_engine_updates = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "Droply", "engine_updates")
if os.path.isdir(_engine_updates) and _engine_updates not in sys.path:
    sys.path.insert(0, _engine_updates)

try:
    import imageio_ffmpeg
except ImportError:
    imageio_ffmpeg = None


def _get_ytdlp_version() -> str:
    # 1. Try yt_dlp.version directly
    try:
        from yt_dlp.version import __version__
        if __version__ and str(__version__).lower() != "installed":
            return str(__version__)
    except Exception:
        pass

    # 2. Try get_yt_dlp() provider
    try:
        from engine.providers.ytdlp_provider import get_yt_dlp
        yt_mod = get_yt_dlp()
        v = getattr(yt_mod, "__version__", None)
        if v and str(v).lower() != "installed":
            return str(v)
        v = getattr(getattr(yt_mod, "version", None), "__version__", None)
        if v and str(v).lower() != "installed":
            return str(v)
    except Exception:
        pass

    # 3. Try importlib.metadata
    try:
        import importlib.metadata
        v = importlib.metadata.version("yt-dlp")
        if v:
            return str(v)
    except Exception:
        pass

    # 4. Try pkg_resources
    try:
        import pkg_resources
        v = pkg_resources.get_distribution("yt-dlp").version
        if v:
            return str(v)
    except Exception:
        pass

    return "unknown"

from engine.providers.registry import registry
from engine.providers.ytdlp_provider import humanize_error
from engine.settings_manager import settings_manager
from engine.history_manager import history_manager
from engine.queue_manager import queue_manager, DownloadTask
from engine.file_manager import (
    open_folder,
    open_in_folder,
    open_file,
    get_default_download_dir,
    resolve_existing_path
)


# Cryptographic dynamic session authentication token
AUTH_TOKEN = secrets.token_hex(24)

# Active WebSocket connections
active_connections: List[WebSocket] = []
loop: Optional[asyncio.AbstractEventLoop] = None
_ws_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global loop
    loop = asyncio.get_running_loop()

    # Forward queue manager events to WebSocket clients
    def on_queue_event(data: Dict[str, Any]):
        if active_connections and loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(broadcast_ws(data), loop)

    queue_manager.add_listener(on_queue_event)
    yield


app = FastAPI(title="Droply API", version="1.0.0", lifespan=lifespan)

# Restrict CORS to localhost and local webview origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8765",
        "http://localhost:8765",
        "http://127.0.0.1",
        "http://localhost",
        "null",
    ],
    allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_and_auth_middleware(request: Request, call_next):
    path = request.url.path

    # 1. Cross-Site Attack Protection (Sec-Fetch-Site check)
    sec_fetch = request.headers.get("sec-fetch-site", "").lower()
    if sec_fetch == "cross-site":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": "Forbidden", "detail": "Cross-site requests prohibited."}
        )

    # 2. Origin Verification: block requests from external websites
    origin = request.headers.get("origin")
    if origin:
        origin_lower = origin.lower()
        is_local = (
            origin_lower.startswith("http://127.0.0.1") or
            origin_lower.startswith("http://localhost") or
            origin_lower == "null" or
            origin_lower.startswith("file://")
        )
        if not is_local:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"error": "Forbidden", "detail": f"Origin '{origin}' is not authorized."}
            )

    # 3. Dynamic Authentication Token verification for /api/* routes
    public_paths = (
        "/api/auth/token",
        "/api/system/status-public",
        "/docs",
        "/openapi.json",
        "/favicon.ico",
        "/",
    )
    if path.startswith("/api/") and path not in public_paths:
        token = request.headers.get("x-auth-token") or request.query_params.get("token")
        if not token or not secrets.compare_digest(token, AUTH_TOKEN):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"error": "Unauthorized", "detail": "Missing or invalid X-Auth-Token."}
            )

    response = await call_next(request)
    return response


async def broadcast_ws(message: Dict[str, Any]):
    async with _ws_lock:
        dead = []
        for ws in list(active_connections):
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=2.0)
            except Exception:
                dead.append(ws)
                try:
                    await ws.close()
                except Exception:
                    pass
        for ws in dead:
            if ws in active_connections:
                active_connections.remove(ws)


@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token") or websocket.headers.get("x-auth-token")
    if not token or not secrets.compare_digest(token, AUTH_TOKEN):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    async with _ws_lock:
        active_connections.append(websocket)
    try:
        # Send initial snapshot of all active tasks
        async with _ws_lock:
            await websocket.send_json({
                "event": "initial_state",
                "tasks": queue_manager.get_all_tasks()
            })
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with _ws_lock:
            if websocket in active_connections:
                active_connections.remove(websocket)


# ---------------- API REQUEST MODELS ----------------

class DetectRequest(BaseModel):
    url: str = Field(..., max_length=2048)

class AnalyzeRequest(BaseModel):
    url: str = Field(..., max_length=2048)

class DownloadRequest(BaseModel):
    url: str = Field(..., max_length=2048)
    format_id: str = Field("bestvideo+bestaudio/best", max_length=200)
    format_label: str = Field("Best Quality", max_length=200)
    is_audio: bool = False
    audio_format: str = Field("mp3", max_length=50)
    output_dir: Optional[str] = Field(None, max_length=1000)
    title: Optional[str] = Field(None, max_length=500)
    thumbnail: Optional[str] = Field(None, max_length=2048)
    expected_size_str: Optional[str] = Field(None, max_length=100)
    expected_bytes: Optional[int] = Field(None)

class BatchParseRequest(BaseModel):
    text: str = Field(..., max_length=50000)

class BatchEnqueueRequest(BaseModel):
    urls: List[str] = Field(..., max_length=500)
    is_audio: bool = False
    format_id: str = Field("bestvideo+bestaudio/best", max_length=200)
    format_label: str = Field("Best Quality", max_length=200)
    audio_format: str = Field("mp3", max_length=50)
    output_dir: Optional[str] = Field(None, max_length=1000)
    playlist_folder: Optional[str] = Field(None, max_length=200)
    items: Optional[List[Dict[str, Any]]] = Field(None, max_length=500)

class PathRequest(BaseModel):
    path: Optional[str] = Field(None, max_length=1000)

class FileRequest(BaseModel):
    file_path: Optional[str] = Field("", max_length=1000)
    task_id: Optional[str] = Field(None, max_length=100)

class SettingsUpdateRequest(BaseModel):
    settings: Optional[Dict[str, Any]] = None


# ---------------- REST ENDPOINTS ----------------

@app.post("/api/detect-platform")
async def detect_platform(req: DetectRequest):
    url = req.url.strip()
    valid = registry.is_valid_url(url)
    platform = registry.detect_platform(url) if valid else "Unknown"
    return {"valid": valid, "platform": platform}


@app.get("/api/proxy/thumbnail")
async def proxy_thumbnail(url: str):
    """
    Safely proxies media thumbnails (especially for platforms with anti-hotlinking like Bilibili / hdslb)
    with proper Origin, Referer, and User-Agent headers.
    """
    clean_url = (url or "").strip()
    if clean_url.startswith("//"):
        clean_url = f"https:{clean_url}"
    if not clean_url or not (clean_url.startswith("http://") or clean_url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid thumbnail URL.")

    def _fetch():
        import urllib.request
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
        url_lower = clean_url.lower()
        if "bilibili" in url_lower or "hdslb" in url_lower:
            headers["Referer"] = "https://www.bilibili.com/"
        elif "instagram" in url_lower or "cdninstagram" in url_lower:
            headers["Referer"] = "https://www.instagram.com/"
        elif "tiktok" in url_lower or "tiktokcdn" in url_lower:
            headers["Referer"] = "https://www.tiktok.com/"
        else:
            headers["Referer"] = clean_url

        req = urllib.request.Request(clean_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read()
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            return content, content_type

    try:
        loop = asyncio.get_event_loop()
        content, content_type = await loop.run_in_executor(None, _fetch)
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=604800, immutable",
                "Access-Control-Allow-Origin": "*"
            }
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Thumbnail preview could not be loaded.")


@app.post("/api/analyze")
async def analyze_url(req: AnalyzeRequest):
    url = req.url.strip()
    if not registry.is_valid_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL provided. Please provide a valid web link.")

    try:
        provider = registry.get_provider_for_url(url)
        # Run blocking metadata extraction in executor to keep event loop free
        loop = asyncio.get_event_loop()
        meta = await loop.run_in_executor(None, provider.get_metadata, url)

        # Convert to response dict
        return {
            "id": meta.id,
            "url": meta.url,
            "title": meta.title,
            "platform": meta.platform,
            "uploader": meta.uploader,
            "uploader_url": meta.uploader_url,
            "duration": meta.duration,
            "duration_str": meta.duration_str,
            "thumbnail": meta.thumbnail,
            "description": meta.description,
            "is_playlist": getattr(meta, "is_playlist", False),
            "playlist_count": getattr(meta, "playlist_count", 0),
            "playlist_entries": getattr(meta, "playlist_entries", []),
            "formats": [
                {
                    "format_id": f.format_id,
                    "ext": f.ext,
                    "resolution": f.resolution,
                    "label": f.label,
                    "filesize_approx": f.filesize_approx,
                    "filesize_str": f.filesize_str,
                    "has_video": f.has_video,
                    "has_audio": f.has_audio,
                    "is_audio_only": f.is_audio_only
                } for f in meta.formats
            ],
            "audio_formats": [
                {
                    "format_id": f.format_id,
                    "ext": f.ext,
                    "resolution": f.resolution,
                    "label": f.label,
                    "filesize_approx": f.filesize_approx,
                    "filesize_str": f.filesize_str,
                    "has_video": f.has_video,
                    "has_audio": f.has_audio,
                    "is_audio_only": f.is_audio_only
                } for f in meta.audio_formats
            ],
            "default_download_dir": settings_manager.get("download_dir", get_default_download_dir())
        }
    except Exception as e:
        err_str = str(e)
        friendly = "Unable to analyze media at this URL."
        suggestion = "Make sure the URL is accessible and the media is public."
        technical = err_str
        if "|SPLIT|" in err_str:
            parts = err_str.split("|SPLIT|")
            friendly = parts[0]
            if len(parts) >= 3:
                suggestion = parts[1]
                technical = parts[2]
            else:
                technical = parts[1]
        elif hasattr(e, "detail"):
            friendly = str(e.detail)
        return JSONResponse(status_code=422, content={
            "error_friendly": friendly,
            "error_suggestion": suggestion,
            "error_technical": technical
        })


@app.post("/api/download")
async def start_download(req: DownloadRequest):
    url = req.url.strip()
    if not registry.is_valid_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL provided.")

    out_dir = req.output_dir or settings_manager.get("download_dir", get_default_download_dir())
    task = queue_manager.add_task(
        url=url,
        title=req.title or "",
        thumbnail=req.thumbnail or "",
        format_id=req.format_id,
        format_label=req.format_label,
        is_audio=req.is_audio,
        audio_format=req.audio_format,
        output_dir=out_dir,
        expected_size_str=req.expected_size_str or "",
        expected_bytes=req.expected_bytes or 0
    )
    return task.to_dict()


@app.post("/api/playlist/extract")
async def extract_playlist_api(req: AnalyzeRequest):
    url = req.url.strip()
    if not registry.is_valid_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL provided.")

    try:
        provider = registry.get_provider_for_url(url)
        loop = asyncio.get_event_loop()
        meta = await loop.run_in_executor(None, provider.get_metadata, url)
        return {
            "title": meta.title,
            "platform": meta.platform,
            "thumbnail": meta.thumbnail,
            "is_playlist": getattr(meta, "is_playlist", False),
            "playlist_count": getattr(meta, "playlist_count", 0),
            "entries": getattr(meta, "playlist_entries", []),
            "default_download_dir": settings_manager.get("download_dir", get_default_download_dir())
        }
    except Exception as e:
        err_str = str(e)
        friendly = "Unable to extract playlist."
        suggestion = "Make sure the playlist is public and accessible."
        technical = err_str
        if "|SPLIT|" in err_str:
            parts = err_str.split("|SPLIT|")
            friendly = parts[0]
            if len(parts) >= 3:
                suggestion = parts[1]
                technical = parts[2]
            else:
                technical = parts[1]
        return JSONResponse(status_code=422, content={
            "error_friendly": friendly,
            "error_suggestion": suggestion,
            "error_technical": technical
        })


@app.post("/api/batch/parse")
async def batch_parse(req: BatchParseRequest):
    """
    Parses pasted text into clean unique URLs, expanding playlist links into individual tracks.
    """
    raw = req.text
    urls = re.findall(r'https?://[^\s,;"\'<>]+', raw)
    unique_urls = []
    seen = set()
    for u in urls:
        u_clean = u.rstrip('.,;)]}>')
        if u_clean not in seen and registry.is_valid_url(u_clean):
            seen.add(u_clean)
            unique_urls.append(u_clean)

    items = []
    loop = asyncio.get_event_loop()
    for u in unique_urls:
        provider = registry.get_provider_for_url(u)
        is_playlist = hasattr(provider, "is_playlist_url") and provider.is_playlist_url(u)
        if is_playlist:
            try:
                meta = await loop.run_in_executor(None, provider.get_metadata, u)
                if meta and getattr(meta, "is_playlist", False) and meta.playlist_entries:
                    p_folder = meta.title
                    for entry in meta.playlist_entries:
                        items.append({
                            "url": entry["url"],
                            "title": entry["title"],
                            "platform": meta.platform,
                            "playlist_folder": p_folder,
                            "thumbnail": entry.get("thumbnail") or meta.thumbnail
                        })
                    continue
            except Exception:
                pass

        items.append({
            "url": u,
            "title": "",
            "platform": registry.detect_platform(u),
            "playlist_folder": None,
            "thumbnail": ""
        })

    return {"count": len(items), "items": items}


@app.post("/api/batch/enqueue")
async def batch_enqueue(req: BatchEnqueueRequest):
    base_dir = req.output_dir or settings_manager.get("download_dir", get_default_download_dir())

    # Build lookup map for metadata items if passed
    items_map = {}
    if req.items:
        for it in req.items:
            if isinstance(it, dict) and it.get("url"):
                items_map[it["url"]] = it

    created_tasks = []
    for u in req.urls:
        if registry.is_valid_url(u):
            it_info = items_map.get(u, {})
            title = it_info.get("title", "")
            thumb = it_info.get("thumbnail", "")

            # If playlist_folder is specified, download into dedicated playlist subfolder
            folder_name = it_info.get("playlist_folder") or req.playlist_folder
            if folder_name:
                clean_folder = re.sub(r'[\\/*?:"<>|]', "", folder_name).strip()
                out_dir = os.path.join(base_dir, clean_folder)
            else:
                out_dir = base_dir

            os.makedirs(out_dir, exist_ok=True)

            task = queue_manager.add_task(
                url=u,
                title=title,
                thumbnail=thumb,
                format_id=req.format_id,
                format_label=req.format_label,
                is_audio=req.is_audio,
                audio_format=req.audio_format,
                output_dir=out_dir
            )
            created_tasks.append(task.to_dict())

    return {"count": len(created_tasks), "tasks": created_tasks}


@app.get("/api/tasks")
async def get_tasks():
    return queue_manager.get_all_tasks()


@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    success = queue_manager.cancel_task(task_id)
    return {"success": success}


@app.post("/api/tasks/{task_id}/retry")
async def retry_task(task_id: str):
    success = queue_manager.retry_task(task_id)
    return {"success": success}


@app.delete("/api/tasks/{task_id}")
async def remove_task(task_id: str):
    success = queue_manager.remove_task(task_id)
    return {"success": success}


@app.post("/api/tasks/clear-finished")
async def clear_finished():
    queue_manager.clear_finished()
    return {"success": True}


@app.get("/api/history")
async def get_history():
    return history_manager.get_all()


@app.delete("/api/history/{item_id}")
async def delete_history_item(item_id: str, delete_file: bool = False):
    success = history_manager.remove_entry(item_id, delete_file=delete_file)
    return {"success": success}


@app.post("/api/history/clear")
async def clear_history():
    history_manager.clear_all()
    return {"success": True}


@app.get("/api/settings")
async def get_settings():
    return settings_manager.get_all()


@app.api_route("/api/settings", methods=["POST", "PUT"])
async def update_settings_endpoint(req: Dict[str, Any]):
    new_settings = req.get("settings", req) if isinstance(req, dict) else {}
    updated = settings_manager.update(new_settings)
    return updated


@app.post("/api/open-folder")
async def api_open_folder(req: PathRequest):
    folder = req.path or settings_manager.get("download_dir", get_default_download_dir())
    success = open_folder(folder)
    return {"success": success, "path": folder}


def _resolve_request_file(file_path: Optional[str], task_id: Optional[str] = None) -> Optional[str]:
    target = (file_path or "").strip()
    if target:
        resolved = resolve_existing_path(target)
        if resolved:
            return resolved

    # Fallback to task_id lookup in queue_manager
    if task_id:
        task = queue_manager.get_task(task_id)
        if task and task.file_path:
            resolved = resolve_existing_path(task.file_path)
            if resolved:
                return resolved

    # Fallback to history lookup if task_id matches a record
    if task_id:
        for item in history_manager.get_all():
            if item.get("id") == task_id and item.get("file_path"):
                resolved = resolve_existing_path(item.get("file_path"))
                if resolved:
                    return resolved

    # Fallback: check download directory for basename of target
    if target:
        base = os.path.basename(target)
        download_dir = settings_manager.get("download_dir", get_default_download_dir())
        cand = os.path.join(download_dir, base)
        resolved = resolve_existing_path(cand)
        if resolved:
            return resolved

    return target if (target and os.path.exists(target)) else None


def is_safe_disk_path(candidate_path: str) -> bool:
    """Path Traversal Guard: Ensures file paths cannot traverse outside permitted user directories."""
    if not candidate_path:
        return False
    try:
        resolved = os.path.realpath(os.path.abspath(candidate_path))
        download_dir = os.path.realpath(os.path.abspath(settings_manager.get("download_dir", get_default_download_dir())))
        default_dir = os.path.realpath(os.path.abspath(get_default_download_dir()))
        temp_dir = os.path.realpath(os.path.abspath(tempfile.gettempdir()))
        dot_droply = os.path.realpath(os.path.abspath(str(Path.home() / ".droply")))
        localappdata = os.path.realpath(os.path.abspath(os.environ.get("LOCALAPPDATA", str(Path.home()))))

        allowed_prefixes = [download_dir, default_dir, temp_dir, dot_droply, localappdata]

        for task in queue_manager.get_all_tasks():
            if task.get("file_path"):
                allowed_prefixes.append(os.path.realpath(os.path.abspath(task["file_path"])))
        for record in history_manager.get_all():
            if record.get("file_path"):
                allowed_prefixes.append(os.path.realpath(os.path.abspath(record["file_path"])))

        for prefix in allowed_prefixes:
            try:
                if resolved == prefix or os.path.commonpath([resolved, prefix]) == prefix:
                    return True
            except ValueError:
                continue
        return False
    except Exception:
        return False


@app.post("/api/reveal-file")
async def api_reveal_file(req: FileRequest):
    resolved = _resolve_request_file(req.file_path, req.task_id)
    if resolved:
        if not is_safe_disk_path(resolved):
            raise HTTPException(status_code=403, detail="Path traversal detected: Access denied.")
        success = open_in_folder(resolved)
        return {"success": success}
    folder = settings_manager.get("download_dir", get_default_download_dir())
    success = open_folder(folder)
    return {"success": success}


@app.post("/api/open-file")
async def api_open_file(req: FileRequest):
    resolved = _resolve_request_file(req.file_path, req.task_id)
    if resolved:
        if not is_safe_disk_path(resolved):
            raise HTTPException(status_code=403, detail="Path traversal detected: Access denied.")
        success = open_file(resolved)
        if not success:
            success = open_in_folder(resolved)
        return {"success": success}
    return {"success": False, "error": "File not found"}


@app.post("/api/browse-folder")
async def browse_folder():
    """
    Opens native Windows folder picker modal and returns the chosen directory.
    """
    loop = asyncio.get_event_loop()
    def _picker():
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            initial = settings_manager.get("download_dir", get_default_download_dir())
            chosen = filedialog.askdirectory(initialdir=initial, title="Select Droply Download Directory")
            root.destroy()
            return chosen if chosen else None
        except Exception as e:
            print("Folder picker dialog error:", e)
            return None

    folder = await loop.run_in_executor(None, _picker)
    if folder:
        settings_manager.update({"download_dir": folder})
        return {"folder": folder, "updated": True}
    return {"folder": None, "updated": False}


@app.post("/api/browse-cookie-file")
async def browse_cookie_file():
    """
    Opens native Windows file picker modal to select cookies.txt.
    """
    loop = asyncio.get_event_loop()
    def _picker():
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            initial = str(Path.home() / ".droply")
            if not os.path.exists(initial):
                initial = str(Path.home())
            chosen = filedialog.askopenfilename(
                initialdir=initial,
                title="Select cookies.txt for Droply",
                filetypes=[("Text files (*.txt)", "*.txt"), ("All Files (*.*)", "*.*")]
            )
            root.destroy()
            return chosen if chosen else None
        except Exception as e:
            print("Cookie file picker dialog error:", e)
            return None

    file_path = await loop.run_in_executor(None, _picker)
    if file_path:
        settings_manager.update({"cookie_file": file_path})
        return {"cookie_file": file_path, "updated": True}
    return {"cookie_file": None, "updated": False}


@app.get("/api/auth/token")
async def get_session_token(request: Request):
    """Provides the active session token only to authorized local origins."""
    sec_fetch = request.headers.get("sec-fetch-site", "").lower()
    if sec_fetch == "cross-site":
        raise HTTPException(status_code=403, detail="Cross-site token extraction prohibited.")
    origin = request.headers.get("origin")
    if origin:
        origin_lower = origin.lower()
        if not (origin_lower.startswith("http://127.0.0.1") or origin_lower.startswith("http://localhost") or origin_lower == "null" or origin_lower.startswith("file://")):
            raise HTTPException(status_code=403, detail="Origin not authorized.")
    return {"token": AUTH_TOKEN}


@app.get("/api/auth/browsers")
async def get_available_browsers():
    """
    Scans the system for installed web browsers and returns current cookie_browser setting.
    """
    loop = asyncio.get_event_loop()
    def _probe():
        appdata = os.environ.get('APPDATA', '')
        localappdata = os.environ.get('LOCALAPPDATA', '')
        progfiles = os.environ.get('ProgramFiles', '')
        progfiles86 = os.environ.get('ProgramFiles(x86)', '')
        
        path_map = {
            'chrome': [
                Path(localappdata) / 'Google/Chrome/User Data',
                Path(progfiles) / 'Google/Chrome/Application/chrome.exe',
                Path(progfiles86) / 'Google/Chrome/Application/chrome.exe',
            ],
            'edge': [
                Path(localappdata) / 'Microsoft/Edge/User Data',
                Path(progfiles86) / 'Microsoft/Edge/Application/msedge.exe',
                Path(progfiles) / 'Microsoft/Edge/Application/msedge.exe',
            ],
            'firefox': [
                Path(appdata) / 'Mozilla/Firefox/Profiles',
                Path(progfiles) / 'Mozilla Firefox/firefox.exe',
                Path(progfiles86) / 'Mozilla Firefox/firefox.exe',
            ],
            'brave': [
                Path(localappdata) / 'BraveSoftware/Brave-Browser/User Data',
                Path(progfiles) / 'BraveSoftware/Brave-Browser/Application/brave.exe',
            ],
            'opera': [
                Path(appdata) / 'Opera Software/Opera Stable',
            ],
            'vivaldi': [
                Path(localappdata) / 'Vivaldi/User Data',
            ]
        }
        
        installed = []
        for b, cands in path_map.items():
            if any(p.exists() for p in cands):
                installed.append(b)

        return {
            "installed": installed,
            "cookie_browser": settings_manager.get("cookie_browser", "none")
        }

    return await loop.run_in_executor(None, _probe)


class CookieUploadRequest(BaseModel):
    content: str = Field(..., max_length=5000000)


@app.post("/api/auth/cookies/upload")
async def upload_cookie_content(req: CookieUploadRequest):
    """
    Saves uploaded Netscape cookies.txt directly to ~/.droply/cookies.txt and activates it.
    """
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty cookie content provided.")

    target_dir = Path.home() / ".droply"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / "cookies.txt"

    with open(target_file, "w", encoding="utf-8") as f:
        f.write(content)

    settings_manager.update({"cookie_file": str(target_file)})
    return {
        "status": "success",
        "cookie_file": str(target_file),
        "size": len(content)
    }


def _load_app_version():
    env_v = os.environ.get("DROPLY_VERSION")
    if env_v:
        return env_v if env_v.startswith("v") else f"v{env_v}"

    candidates = []
    if getattr(sys, "frozen", False):
        if hasattr(sys, "_MEIPASS"):
            candidates.append(os.path.join(sys._MEIPASS, "VERSION"))
        candidates.append(os.path.join(os.path.dirname(sys.executable), "VERSION"))
    candidates.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), "VERSION"))
    candidates.append(os.path.join(os.getcwd(), "VERSION"))

    for p in candidates:
        if p and os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    ver = f.read().strip()
                    if ver:
                        return ver if ver.startswith("v") else f"v{ver}"
            except Exception:
                pass
    return "v1.4.0"


APP_VERSION = _load_app_version()


class InstallerDownloadManager:
    def __init__(self):
        self.status = "idle"  # "idle", "downloading", "completed", "error", "cancelled"
        self.downloaded_bytes = 0
        self.total_bytes = 0
        self.speed_bps = 0
        self.percent = 0.0
        self.error_message = ""
        self.installer_path = ""
        self._cancel_event = threading.Event()
        self._current_gen = 0
        self._lock = threading.Lock()

    def start_download(self, url: str, expected_size: int = 0):
        with self._lock:
            # Cancel any existing or lingering thread immediately
            self._cancel_event.set()
            self._current_gen += 1
            gen = self._current_gen
            self._cancel_event = threading.Event()

            self.status = "downloading"
            self.downloaded_bytes = 0
            self.total_bytes = expected_size or 0
            self.speed_bps = 0
            self.percent = 0.0
            self.error_message = ""
            self.installer_path = os.path.join(tempfile.gettempdir(), "Droply-Setup.exe")

        threading.Thread(target=self._download_worker, args=(url, gen), daemon=True).start()

    def cancel_download(self):
        with self._lock:
            self._cancel_event.set()
            self.status = "idle"
            self.downloaded_bytes = 0
            self.speed_bps = 0
            self.percent = 0.0

    def _download_worker(self, url: str, gen: int):
        import time
        import urllib.request
        resp = None
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Droply-App"})
            resp = urllib.request.urlopen(req, timeout=30)
            total_len = resp.headers.get("Content-Length")
            if total_len:
                try:
                    with self._lock:
                        if self._current_gen == gen:
                            self.total_bytes = int(total_len)
                except Exception:
                    pass

            chunk_size = 64 * 1024
            last_time = time.time()
            bytes_since_last = 0
            bytes_written = 0

            with open(self.installer_path, "wb") as f:
                while True:
                    if self._cancel_event.is_set() or self._current_gen != gen:
                        break
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    bytes_written += len(chunk)
                    bytes_since_last += len(chunk)

                    now = time.time()
                    dt = now - last_time
                    if dt >= 0.4:
                        speed = int(bytes_since_last / dt)
                        bytes_since_last = 0
                        last_time = now
                        with self._lock:
                            if self._current_gen == gen:
                                self.downloaded_bytes = bytes_written
                                self.speed_bps = speed
                                if self.total_bytes > 0:
                                    self.percent = min(round((bytes_written / self.total_bytes) * 100, 1), 99.9)

            if self._cancel_event.is_set() or self._current_gen != gen:
                try:
                    if os.path.exists(self.installer_path):
                        os.remove(self.installer_path)
                except Exception:
                    pass
                with self._lock:
                    if self._current_gen == gen:
                        self.status = "idle"
                        self.downloaded_bytes = 0
            else:
                with self._lock:
                    if self._current_gen == gen:
                        self.downloaded_bytes = bytes_written
                        if self.total_bytes == 0:
                            self.total_bytes = bytes_written
                        else:
                            self.downloaded_bytes = max(bytes_written, self.total_bytes)
                        self.status = "completed"
                        self.percent = 100.0
                        self.speed_bps = 0
        except Exception as e:
            with self._lock:
                if self._current_gen == gen:
                    self.status = "error"
                    self.error_message = str(e)
        finally:
            if resp:
                try:
                    resp.close()
                except Exception:
                    pass


installer_manager = InstallerDownloadManager()


class DownloadInstallerRequest(BaseModel):
    url: str
    size: Optional[int] = 0


@app.get("/api/system/status")
async def system_status():
    base_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    bundled = base_dir / "bin" / "ffmpeg.exe"
    ffmpeg_exe = str(bundled) if bundled.exists() else None
    if not ffmpeg_exe and imageio_ffmpeg is not None:
        try:
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            pass

    cookie_path = None
    custom_c = settings_manager.get("cookie_file")
    if custom_c and os.path.exists(custom_c) and os.path.getsize(custom_c) > 0:
        cookie_path = custom_c
    elif (Path.home() / ".droply" / "cookies.txt").exists() and (Path.home() / ".droply" / "cookies.txt").stat().st_size > 0:
        cookie_path = str(Path.home() / ".droply" / "cookies.txt")
    elif (Path.cwd() / "cookies.txt").exists() and (Path.cwd() / "cookies.txt").stat().st_size > 0:
        cookie_path = str(Path.cwd() / "cookies.txt")

    cookie_browser = settings_manager.get("cookie_browser", "none")
    cookies_ready = bool(cookie_path or (cookie_browser and cookie_browser != "none"))

    return {
        "app_version": APP_VERSION,
        "ffmpeg_ready": bool(ffmpeg_exe and os.path.exists(ffmpeg_exe)),
        "ffmpeg_path": ffmpeg_exe,
        "ytdlp_version": _get_ytdlp_version(),
        "default_dir": settings_manager.get("download_dir", get_default_download_dir()),
        "python_version": sys.version.split()[0],
        "cookies_ready": cookies_ready,
        "cookies_path": cookie_path,
        "cookie_browser": cookie_browser
    }


def _read_native_clipboard() -> str:
    """Reads plain text directly from the OS clipboard without browser permission prompts."""
    text = ""
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes
            CF_UNICODETEXT = 13
            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            opened = False
            for _ in range(5):
                if user32.OpenClipboard(None):
                    opened = True
                    break
                time.sleep(0.02)

            if opened:
                try:
                    h_data = user32.GetClipboardData(CF_UNICODETEXT)
                    if h_data:
                        ptr = kernel32.GlobalLock(h_data)
                        if ptr:
                            try:
                                text = ctypes.wstring_at(ptr) or ""
                            finally:
                                kernel32.GlobalUnlock(h_data)
                finally:
                    user32.CloseClipboard()
        except Exception:
            pass

    if not text:
        try:
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            text = root.clipboard_get()
            root.destroy()
        except Exception:
            pass

    return text.strip() if text else ""


@app.get("/api/system/clipboard")
async def get_system_clipboard():
    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, _read_native_clipboard)
    return {"text": text}


@app.get("/api/system/check-updates")
async def check_updates_endpoint():
    import json
    current_ytdlp_version = _get_ytdlp_version()
    release_url = "https://github.com/Amlan-Sarkar/Droply/releases"

    loop = asyncio.get_event_loop()

    def _fetch_github():
        try:
            import urllib.request
            req = urllib.request.Request(
                "https://api.github.com/repos/Amlan-Sarkar/Droply/releases/latest",
                headers={"User-Agent": "Droply-App"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                tag = data.get("tag_name", APP_VERSION)
                body = data.get("body", "")
                pub_date = data.get("published_at", "")
                html_url = data.get("html_url", release_url)

                installer_url = ""
                installer_size = 0
                installer_name = ""

                assets = data.get("assets", [])
                for a in assets:
                    name = a.get("name", "")
                    if name.endswith(".exe") or "Setup" in name:
                        installer_url = a.get("browser_download_url", "")
                        installer_size = a.get("size", 0)
                        installer_name = name
                        break

                is_up_to_date = (tag.lstrip('v') == APP_VERSION.lstrip('v'))
                return {
                    "tag": tag,
                    "up_to_date": is_up_to_date,
                    "release_url": html_url,
                    "release_notes": body,
                    "published_at": pub_date,
                    "installer_url": installer_url,
                    "installer_size": installer_size,
                    "installer_name": installer_name
                }
        except Exception:
            pass
        return {
            "tag": APP_VERSION,
            "up_to_date": True,
            "release_url": release_url,
            "release_notes": "",
            "published_at": "",
            "installer_url": "",
            "installer_size": 0,
            "installer_name": ""
        }

    def _fetch_pypi():
        try:
            import urllib.request
            req = urllib.request.Request(
                "https://pypi.org/pypi/yt-dlp/json",
                headers={"User-Agent": "Droply-App"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                ver = data.get("info", {}).get("version")
                if ver:
                    def _ver_tuple(v_str):
                        try:
                            return tuple(int(x) for x in re.findall(r'\d+', str(v_str)))
                        except Exception:
                            return (0,)
                    clean_ver = _ver_tuple(ver)
                    clean_curr = _ver_tuple(current_ytdlp_version)
                    return ver, (clean_ver <= clean_curr)
        except Exception:
            pass
        return current_ytdlp_version, True

    gh_info = await loop.run_in_executor(None, _fetch_github)
    ytdlp_latest, ytdlp_up_to_date = await loop.run_in_executor(None, _fetch_pypi)

    return {
        "app_installed": APP_VERSION,
        "app_latest": gh_info["tag"],
        "app_up_to_date": gh_info["up_to_date"],
        "release_url": gh_info["release_url"],
        "release_notes": gh_info["release_notes"],
        "published_at": gh_info["published_at"],
        "installer_url": gh_info["installer_url"],
        "installer_size": gh_info["installer_size"],
        "installer_name": gh_info["installer_name"],
        "ytdlp_installed": current_ytdlp_version,
        "ytdlp_latest": ytdlp_latest,
        "ytdlp_up_to_date": ytdlp_up_to_date
    }


@app.post("/api/system/download-installer")
async def download_installer_endpoint(req: DownloadInstallerRequest):
    if not req.url:
        raise HTTPException(status_code=400, detail="Missing installer URL")
    installer_manager.start_download(req.url, req.size or 0)
    return {"status": "started"}


@app.get("/api/system/download-installer-status")
async def download_installer_status_endpoint():
    return {
        "status": installer_manager.status,
        "downloaded_bytes": installer_manager.downloaded_bytes,
        "total_bytes": installer_manager.total_bytes,
        "speed_bps": installer_manager.speed_bps,
        "percent": installer_manager.percent,
        "error": installer_manager.error_message,
        "installer_path": installer_manager.installer_path if installer_manager.status == "completed" else ""
    }


@app.post("/api/system/cancel-installer-download")
async def cancel_installer_download_endpoint():
    installer_manager.cancel_download()
    return {"status": "cancelled"}


@app.post("/api/system/install-and-restart")
async def install_and_restart_endpoint():
    path = installer_manager.installer_path
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=400, detail="Installer file not found. Download it first.")

    import subprocess
    import threading
    import time

    try:
        # Launch the Inno Setup installer silently or normally
        # Using subprocess.Popen allows installer to run independently while Droply exits
        subprocess.Popen([path], shell=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to launch installer: {e}")

    def _exit_app():
        time.sleep(1.0)
        os._exit(0)

    threading.Thread(target=_exit_app, daemon=True).start()
    return {"status": "success", "message": "Installer launched. Restarting Droply..."}


@app.post("/api/system/update-ytdlp")
async def update_ytdlp_endpoint():
    loop = asyncio.get_event_loop()

    def _run_update():
        import json
        import urllib.request
        import zipfile
        import tempfile
        import importlib

        try:
            current_ver = _get_ytdlp_version()

            # 1. Query latest version info from PyPI
            req = urllib.request.Request(
                "https://pypi.org/pypi/yt-dlp/json",
                headers={"User-Agent": "Droply-Updater"}
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            latest_ver = str(data.get("info", {}).get("version", "")).strip()
            if not latest_ver:
                return {"status": "error", "message": "Could not verify latest yt-dlp version from PyPI."}

            clean_latest = latest_ver.lstrip('v')
            clean_curr = current_ver.strip().lstrip('v')

            if clean_latest == clean_curr:
                return {
                    "status": "success",
                    "already_up_to_date": True,
                    "message": f"yt-dlp core engine is already up to date ({current_ver}).",
                    "version": current_ver
                }

            # 2. Locate pure Python wheel package
            wheel_url = None
            for file_info in data.get("urls", []):
                fname = file_info.get("filename", "")
                if fname.endswith(".whl") and "none-any" in fname:
                    wheel_url = file_info.get("url")
                    break

            if not wheel_url:
                for file_info in data.get("urls", []):
                    if file_info.get("filename", "").endswith(".whl"):
                        wheel_url = file_info.get("url")
                        break

            if not wheel_url:
                return {"status": "error", "message": f"No wheel package found for yt-dlp {latest_ver}."}

            # 3. Download wheel and extract yt_dlp directly into local engine_updates directory
            updates_base = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "Droply", "engine_updates")
            os.makedirs(updates_base, exist_ok=True)

            with tempfile.TemporaryDirectory() as tmp_dir:
                tmp_whl = os.path.join(tmp_dir, "ytdlp_update.whl")
                urllib.request.urlretrieve(wheel_url, tmp_whl)

                with zipfile.ZipFile(tmp_whl, "r") as zf:
                    for member in zf.infolist():
                        if member.filename.startswith("yt_dlp/") or member.filename.startswith("yt_dlp\\"):
                            zf.extract(member, updates_base)

            # 4. Ensure path priority and reload yt_dlp in memory
            if updates_base not in sys.path:
                sys.path.insert(0, updates_base)

            importlib.invalidate_caches()
            try:
                import yt_dlp.version  # type: ignore
                importlib.reload(yt_dlp.version)
            except Exception:
                pass
            from engine.providers.ytdlp_provider import get_yt_dlp
            yt_mod = get_yt_dlp()
            importlib.reload(yt_mod)
            new_ver = _get_ytdlp_version()
            clean_new = new_ver.strip().lstrip('v')

            if clean_curr == clean_new or clean_latest == clean_new:
                return {
                    "status": "success",
                    "already_up_to_date": True,
                    "message": f"yt-dlp core engine is already up to date ({new_ver}).",
                    "version": new_ver
                }

            return {
                "status": "success",
                "already_up_to_date": False,
                "message": f"Updated yt-dlp core from {current_ver} to {new_ver}!",
                "version": new_ver
            }
        except Exception as e:
            return {"status": "error", "message": f"Engine update failed: {str(e)}"}

    result = await loop.run_in_executor(None, _run_update)
    return result



# Static web app mounting
def _find_web_dir() -> Optional[Path]:
    candidates = []
    if hasattr(sys, "_MEIPASS"):
        candidates.append(Path(sys._MEIPASS) / "web")
        candidates.append(Path(sys._MEIPASS))
    if getattr(sys, "frozen", False):
        exe_parent = Path(sys.executable).resolve().parent
        candidates.append(exe_parent / "web")
        candidates.append(exe_parent / "_internal" / "web")
    candidates.append(Path(__file__).resolve().parent.parent / "web")
    candidates.append(Path.cwd() / "web")

    for candidate in candidates:
        if candidate and candidate.exists() and (candidate / "index.html").exists():
            return candidate
    return None

web_dir = _find_web_dir()
if web_dir and web_dir.exists():
    app.mount("/static", StaticFiles(directory=str(web_dir)), name="static")
    if (web_dir / "css").exists():
        app.mount("/css", StaticFiles(directory=str(web_dir / "css")), name="css")
    if (web_dir / "js").exists():
        app.mount("/js", StaticFiles(directory=str(web_dir / "js")), name="js")
    if (web_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(web_dir / "assets")), name="assets")

    @app.get("/")
    async def index_page():
        html_file = web_dir / "index.html"
        html = html_file.read_text(encoding="utf-8")
        injected = f'<meta name="droply-auth" content="{AUTH_TOKEN}">\n  <script>window.__DROPLY_AUTH_TOKEN__="{AUTH_TOKEN}";</script>\n</head>'
        html = html.replace('</head>', injected, 1)
        return HTMLResponse(content=html, media_type="text/html")

    @app.get("/favicon.ico")
    async def favicon():
        fav = web_dir / "favicon.ico"
        if fav.exists():
            return FileResponse(str(fav))
        return JSONResponse({"status": "not found"}, status_code=404)


