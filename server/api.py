"""
Droply - FastAPI Server & WebSocket Bridge
Provides REST endpoints and real-time WebSocket broadcasting.
"""

import os
import re
import sys
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

import yt_dlp
import imageio_ffmpeg

from engine.providers.registry import registry
from engine.providers.ytdlp_provider import humanize_error
from engine.settings_manager import settings_manager
from engine.history_manager import history_manager
from engine.queue_manager import queue_manager, DownloadTask
from engine.file_manager import (
    open_folder,
    open_in_folder,
    open_file,
    get_default_download_dir
)


app = FastAPI(title="Droply API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections
active_connections: List[WebSocket] = []
loop: Optional[asyncio.AbstractEventLoop] = None


@app.on_event("startup")
async def startup_event():
    global loop
    loop = asyncio.get_running_loop()

    # Forward queue manager events to WebSocket clients
    def on_queue_event(data: Dict[str, Any]):
        if active_connections and loop:
            asyncio.run_coroutine_threadsafe(broadcast_ws(data), loop)

    queue_manager.add_listener(on_queue_event)


async def broadcast_ws(message: Dict[str, Any]):
    dead = []
    for ws in active_connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in active_connections:
            active_connections.remove(ws)


@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        # Send initial snapshot of all active tasks
        await websocket.send_json({
            "event": "initial_state",
            "tasks": queue_manager.get_all_tasks()
        })
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)
    except Exception:
        if websocket in active_connections:
            active_connections.remove(websocket)


# ---------------- API REQUEST MODELS ----------------

class DetectRequest(BaseModel):
    url: str

class AnalyzeRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: str = "bestvideo+bestaudio/best"
    format_label: str = "Best Quality"
    is_audio: bool = False
    audio_format: str = "mp3"
    output_dir: Optional[str] = None
    title: Optional[str] = None
    thumbnail: Optional[str] = None

class BatchParseRequest(BaseModel):
    text: str

class BatchEnqueueRequest(BaseModel):
    urls: List[str]
    is_audio: bool = False
    format_id: str = "bestvideo+bestaudio/best"
    format_label: str = "Best Quality"
    audio_format: str = "mp3"
    output_dir: Optional[str] = None
    playlist_folder: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None

class PathRequest(BaseModel):
    path: Optional[str] = None

class FileRequest(BaseModel):
    file_path: str

class SettingsUpdateRequest(BaseModel):
    settings: Optional[Dict[str, Any]] = None


# ---------------- REST ENDPOINTS ----------------

@app.post("/api/detect-platform")
async def detect_platform(req: DetectRequest):
    url = req.url.strip()
    valid = registry.is_valid_url(url)
    platform = registry.detect_platform(url) if valid else "Unknown"
    return {"valid": valid, "platform": platform}


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
        technical = err_str
        if "|SPLIT|" in err_str:
            parts = err_str.split("|SPLIT|")
            friendly = parts[0]
            technical = parts[1]
        elif hasattr(e, "detail"):
            friendly = str(e.detail)
        return JSONResponse(status_code=422, content={"error_friendly": friendly, "error_technical": technical})


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
        output_dir=out_dir
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
        technical = err_str
        if "|SPLIT|" in err_str:
            parts = err_str.split("|SPLIT|")
            friendly = parts[0]
            technical = parts[1]
        return JSONResponse(status_code=422, content={"error_friendly": friendly, "error_technical": technical})


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


@app.post("/api/reveal-file")
async def api_reveal_file(req: FileRequest):
    success = open_in_folder(req.file_path)
    return {"success": success}


@app.post("/api/open-file")
async def api_open_file(req: FileRequest):
    success = open_file(req.file_path)
    return {"success": success}


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


@app.get("/api/system/status")
async def system_status():
    base_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    bundled = base_dir / "bin" / "ffmpeg.exe"
    ffmpeg_exe = str(bundled) if bundled.exists() else None
    if not ffmpeg_exe:
        try:
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            pass

    return {
        "ffmpeg_ready": bool(ffmpeg_exe and os.path.exists(ffmpeg_exe)),
        "ffmpeg_path": ffmpeg_exe,
        "ytdlp_version": getattr(yt_dlp, "__version__", getattr(yt_dlp.version, "__version__", "installed")),
        "default_dir": settings_manager.get("download_dir", get_default_download_dir()),
        "python_version": sys.version.split()[0]
    }


@app.get("/api/system/check-updates")
async def check_updates_endpoint():
    import json
    current_app_version = "v1.2.4"
    current_ytdlp_version = getattr(yt_dlp, "__version__", "unknown")
    release_url = "https://github.com/Amlan-Sarkar/Droply/releases"

    loop = asyncio.get_event_loop()

    def _fetch_github():
        try:
            import urllib.request
            req = urllib.request.Request(
                "https://api.github.com/repos/Amlan-Sarkar/Droply/releases/latest",
                headers={"User-Agent": "Droply-App"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                tag = data.get("tag_name")
                if tag:
                    return tag, (tag.lstrip('v') == current_app_version.lstrip('v')), data.get("html_url", release_url)
        except Exception:
            pass
        return current_app_version, True, release_url

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
                    return ver, (ver == current_ytdlp_version)
        except Exception:
            pass
        return current_ytdlp_version, True

    tag, app_up_to_date, release_url = await loop.run_in_executor(None, _fetch_github)
    ytdlp_latest, ytdlp_up_to_date = await loop.run_in_executor(None, _fetch_pypi)

    return {
        "app_installed": current_app_version,
        "app_latest": tag,
        "app_up_to_date": app_up_to_date,
        "release_url": release_url,
        "ytdlp_installed": current_ytdlp_version,
        "ytdlp_latest": ytdlp_latest,
        "ytdlp_up_to_date": ytdlp_up_to_date
    }


@app.post("/api/system/update-ytdlp")
async def update_ytdlp_endpoint():
    loop = asyncio.get_event_loop()

    def _run_update():
        import subprocess
        try:
            cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if proc.returncode == 0:
                import importlib
                importlib.reload(yt_dlp)
                new_ver = getattr(yt_dlp, "__version__", "updated")
                return {"status": "success", "message": f"Updated yt-dlp core to {new_ver}!", "version": new_ver}
            else:
                return {"status": "error", "message": proc.stderr or proc.stdout or "Update failed"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    result = await loop.run_in_executor(None, _run_update)
    return result



# Static web app mounting
base_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
web_dir = base_dir / "web"
if web_dir.exists():
    app.mount("/static", StaticFiles(directory=str(web_dir)), name="static")
    if (web_dir / "css").exists():
        app.mount("/css", StaticFiles(directory=str(web_dir / "css")), name="css")
    if (web_dir / "js").exists():
        app.mount("/js", StaticFiles(directory=str(web_dir / "js")), name="js")
    if (web_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(web_dir / "assets")), name="assets")

    @app.get("/")
    async def index_page():
        return FileResponse(str(web_dir / "index.html"))

    @app.get("/favicon.ico")
    async def favicon():
        fav = web_dir / "favicon.ico"
        if fav.exists():
            return FileResponse(str(fav))
        return JSONResponse({"status": "not found"}, status_code=404)


