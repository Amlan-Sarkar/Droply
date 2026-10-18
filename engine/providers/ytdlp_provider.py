"""
Droply - Universal yt-dlp Provider
Harnesses yt-dlp and local FFmpeg to extract metadata, detect qualities,
merge video/audio streams, and convert audio formats across hundreds of platforms.
"""

import os
import re
import sys
import time
import shutil
from pathlib import Path
from typing import List, Dict, Any, Callable, Optional
from urllib.parse import urlparse

_yt_dlp = None

def get_yt_dlp():
    """Lazy loader for yt-dlp to dramatically accelerate application cold boot."""
    global _yt_dlp
    if _yt_dlp is None:
        import yt_dlp
        _yt_dlp = yt_dlp
    return _yt_dlp

try:
    import imageio_ffmpeg
except ImportError:
    imageio_ffmpeg = None


from .base import BaseProvider, MediaMetadata, MediaFormat, ProviderCapabilities
from ..file_manager import sanitize_filename, get_unique_filename, format_bytes, format_seconds, resolve_existing_path


PLATFORM_PATTERNS = [
    (r'(?:youtube\.com|youtu\.be)', 'YouTube'),
    (r'(?:twitter\.com|x\.com)', 'Twitter / X'),
    (r'tiktok\.com', 'TikTok'),
    (r'reddit\.com', 'Reddit'),
    (r'instagram\.com', 'Instagram'),
    (r'vimeo\.com', 'Vimeo'),
    (r'soundcloud\.com', 'SoundCloud'),
    (r'twitch\.tv', 'Twitch'),
    (r'facebook\.com|fb\.watch', 'Facebook'),
    (r'dailymotion\.com', 'Dailymotion'),
    (r'pinterest\.com', 'Pinterest'),
    (r'bandcamp\.com', 'Bandcamp'),
    (r'bilibili\.com', 'Bilibili'),
    (r'threads\.net', 'Threads'),
    (r'bluesky\.app|bsky\.app', 'Bluesky'),
]


def humanize_error(raw_err: str) -> Dict[str, str]:
    """
    Transforms raw yt-dlp error into a friendly message, actionable suggestion, and technical details.
    """
    err = str(raw_err).lower()
    
    if "requested format is not available" in err:
        return {
            "friendly": "The requested video format or quality is not available from the source.",
            "suggestion": "Try selecting a different resolution (e.g. 1080p, 720p) or an audio-only format.",
            "technical": str(raw_err)
        }
    if "drm" in err or "protected" in err:
        return {
            "friendly": "This media is protected by DRM (Digital Rights Management) and cannot be downloaded.",
            "suggestion": "DRM-encrypted media streams cannot be decrypted.",
            "technical": str(raw_err)
        }
    if "confirm you're not a bot" in err or "not a bot" in err or "bot verification" in err:
        return {
            "friendly": "YouTube anti-bot verification challenge triggered.",
            "suggestion": "YouTube is challenging automated requests from this network. Add your browser cookies (cookies.txt) in Droply Settings or place it into ~/.droply/cookies.txt to bypass this check.",
            "technical": str(raw_err)
        }
    if "video is unavailable" in err or "this video is unavailable" in err or "unavailable" in err:
        return {
            "friendly": "This media is unavailable.",
            "suggestion": "Please check the URL for typos (such as digit '0' vs letter 'O') or verify that the video has not been deleted or restricted.",
            "technical": str(raw_err)
        }
    if "private video" in err or "sign in" in err or "login" in err:
        return {
            "friendly": "This media is private or requires account login to view.",
            "suggestion": "Make sure the URL is accessible and the media is public, or provide session cookies in Settings.",
            "technical": str(raw_err)
        }
    if "403" in err or "forbidden" in err:
        return {
            "friendly": "Download unavailable. The source server rejected the request (403 Forbidden).",
            "suggestion": "The server temporarily blocked the request or the streaming token expired. Try again in a moment.",
            "technical": str(raw_err)
        }
    if "404" in err or "not found" in err or "deleted" in err:
        return {
            "friendly": "Media not found. The content may have been deleted or the link is incorrect.",
            "suggestion": "Verify that the URL exists and is publicly accessible in a web browser.",
            "technical": str(raw_err)
        }
    if "geo" in err or "country" in err:
        return {
            "friendly": "This media is geo-restricted and not available in your region.",
            "suggestion": "This content is blocked in your geographical location. Connect to a VPN (such as Cloudflare WARP, ProtonVPN, or Windscribe) in an unrestricted region.",
            "technical": str(raw_err)
        }
    if "unreachable" in err or "connection" in err or "timed out" in err or "refused" in err or "reset by peer" in err:
        return {
            "friendly": "Network connection timed out or was blocked by host/ISP.",
            "suggestion": "If this platform is restricted or banned by your ISP/region (e.g. TikTok, Reddit, or ISP filters), connect to a VPN (such as Cloudflare WARP or ProtonVPN).",
            "technical": str(raw_err)
        }
    if "unsupported url" in err:
        return {
            "friendly": "This URL is not recognized or not currently supported.",
            "suggestion": "Ensure the URL starts with https:// and points to a supported platform.",
            "technical": str(raw_err)
        }
    
    return {
        "friendly": "An error occurred while accessing the media resource.",
        "suggestion": "Make sure the URL is accessible and the media is public.",
        "technical": str(raw_err)
    }


class YtDlpProvider(BaseProvider):
    def __init__(self):
        self.ffmpeg_path = self._locate_ffmpeg()
        self.js_runtimes = self._locate_js_runtime()

    def _locate_js_runtime(self) -> Dict[str, Any]:
        node_path = shutil.which("node") or shutil.which("node.exe")
        if node_path:
            return {'node': {'path': node_path}}
        deno_path = shutil.which("deno") or shutil.which("deno.exe")
        if deno_path:
            return {'deno': {'path': deno_path}}
        return {}

    def _locate_ffmpeg(self) -> Optional[str]:
        binary_name = "ffmpeg.exe"
        candidates = []

        # 1. Next to executable (PyInstaller onedir root and subfolders)
        if getattr(sys, "frozen", False):
            exe_dir = Path(sys.executable).resolve().parent
            candidates.extend([
                exe_dir / "bin" / binary_name,
                exe_dir / binary_name,
                exe_dir / "_internal" / "bin" / binary_name,
                exe_dir / "_internal" / binary_name,
            ])
            if hasattr(sys, "_MEIPASS"):
                candidates.extend([
                    Path(sys._MEIPASS) / "bin" / binary_name,
                    Path(sys._MEIPASS) / binary_name,
                ])

        # 2. Local repository bin folder
        proj_dir = Path(__file__).resolve().parent.parent.parent
        candidates.extend([
            proj_dir / "bin" / binary_name,
            proj_dir / binary_name,
        ])

        # 3. imageio_ffmpeg bundled binary
        if imageio_ffmpeg is not None:
            try:
                img_ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
                if img_ffmpeg and os.path.exists(img_ffmpeg):
                    candidates.append(Path(img_ffmpeg))
            except Exception:
                pass

        # 4. System PATH
        which_path = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
        if which_path:
            candidates.append(Path(which_path))

        for cand in candidates:
            try:
                if cand and cand.is_file():
                    return str(cand)
            except Exception:
                continue

        return None

    def can_handle(self, url: str) -> bool:
        try:
            parsed = urlparse(url)
            return bool(parsed.scheme in ("http", "https") and parsed.netloc)
        except Exception:
            return False

    def detect_platform(self, url: str) -> str:
        for pattern, name in PLATFORM_PATTERNS:
            if re.search(pattern, url, re.IGNORECASE):
                return name
        parsed = urlparse(url)
        return parsed.netloc.replace("www.", "").capitalize() if parsed.netloc else "Web Media"

    def is_playlist_url(self, url: str) -> bool:
        if not url:
            return False
        # YouTube playlist indicators
        if "list=" in url and ("/playlist" in url or "watch?v=" not in url):
            return True
        if "/playlist" in url or "/sets/" in url or "/album/" in url:
            return True
        return False

    def _locate_cookie_file(self) -> Optional[str]:
        """
        Locates any available cookies.txt file for yt-dlp authentication and bot bypass.
        Checks:
        1. Custom path configured in Droply settings (cookie_file)
        2. %LOCALAPPDATA%/Droply/cookies.txt
        3. ~/.droply/cookies.txt
        4. Application root ./cookies.txt
        """
        try:
            from ..settings_manager import settings_manager
            custom_path = settings_manager.get("cookie_file")
            if custom_path and os.path.exists(custom_path) and os.path.getsize(custom_path) > 0:
                return str(custom_path)
        except Exception:
            pass

        localappdata = os.environ.get('LOCALAPPDATA')
        if localappdata:
            local_app_cookie = Path(localappdata) / "Droply" / "cookies.txt"
            if local_app_cookie.exists() and local_app_cookie.stat().st_size > 0:
                return str(local_app_cookie)

        home_cookie = Path.home() / ".droply" / "cookies.txt"
        if home_cookie.exists() and home_cookie.stat().st_size > 0:
            return str(home_cookie)

        app_cookie = Path.cwd() / "cookies.txt"
        if app_cookie.exists() and app_cookie.stat().st_size > 0:
            return str(app_cookie)

        return None

    def _get_cookie_browser(self) -> Optional[str]:
        """
        Retrieves the configured browser for session cookies, or auto-probes working browsers.
        """
        try:
            from ..settings_manager import settings_manager
            pref = settings_manager.get("cookie_browser", "none")
            if not pref or pref == "none":
                return None
            if pref != "auto":
                return str(pref).lower()
            # Auto-probe mode: find first installed browser that can extract cookies
            candidates = ['firefox', 'brave', 'vivaldi', 'edge', 'chrome', 'opera']
            ytdlp_mod = get_yt_dlp()
            for b in candidates:
                try:
                    probe_ydl = ytdlp_mod.YoutubeDL({'cookiesfrombrowser': (b,), 'quiet': True})
                    if len(list(probe_ydl.cookiejar)) > 0:
                        return b
                except Exception:
                    continue
        except Exception:
            pass
        return None

    def _get_ydl_opts(self, is_playlist: bool = False) -> Dict[str, Any]:
        opts: Dict[str, Any] = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist' if is_playlist else False,
            'skip_download': True,
            'socket_timeout': 15,
            'retries': 5,
            'fragment_retries': 5,
            'extractor_retries': 5,
            'file_access_retries': 3,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
            }
        }
        if self.js_runtimes:
            opts['js_runtimes'] = self.js_runtimes
        if not is_playlist:
            opts['noplaylist'] = True
        if self.ffmpeg_path and os.path.exists(self.ffmpeg_path):
            opts['ffmpeg_location'] = self.ffmpeg_path

        cookie_file = self._locate_cookie_file()
        if cookie_file:
            opts['cookiefile'] = cookie_file
        else:
            cookie_browser = self._get_cookie_browser()
            if cookie_browser:
                opts['cookiesfrombrowser'] = (cookie_browser,)

        return opts

    def get_metadata(self, url: str) -> MediaMetadata:
        is_playlist = self.is_playlist_url(url)
        opts = self._get_ydl_opts(is_playlist=is_playlist)
        info = None
        last_error = None
        ytdlp_mod = get_yt_dlp()

        # Robust extraction with automatic 1-second retry on transient 403 or handshake stalls
        for attempt in range(2):
            try:
                with ytdlp_mod.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                if info:
                    break
            except Exception as e:
                last_error = e
                if attempt == 0:
                    time.sleep(0.6)
                    continue

        if not info and last_error:
            # If single video extraction failed on a playlist URL, try playlist extraction fallback
            if not is_playlist and ("list=" in url or "playlist" in url):
                try:
                    p_opts = self._get_ydl_opts(is_playlist=True)
                    with ytdlp_mod.YoutubeDL(p_opts) as p_ydl:
                        info = p_ydl.extract_info(url, download=False)
                except Exception:
                    err_dict = humanize_error(str(last_error))
                    raise ValueError(f"{err_dict['friendly']}|SPLIT|{err_dict.get('suggestion', '')}|SPLIT|{err_dict['technical']}")
            else:
                err_dict = humanize_error(str(last_error))
                raise ValueError(f"{err_dict['friendly']}|SPLIT|{err_dict.get('suggestion', '')}|SPLIT|{err_dict['technical']}")

        if not info:
            raise ValueError("No media information could be extracted from this URL.")

        # Check if the extracted resource is a Playlist
        if info.get('_type') == 'playlist' or 'entries' in info:
            raw_entries = info.get('entries') or []
            entries = []
            total_duration = 0
            for idx, entry in enumerate(raw_entries):
                if not entry:
                    continue
                eid = str(entry.get('id') or '')
                e_title = entry.get('title') or f"Track {idx + 1}"
                e_url = entry.get('url') or entry.get('webpage_url') or ""
                if not e_url.startswith("http"):
                    e_url = f"https://www.youtube.com/watch?v={eid}" if eid else ""
                e_dur = int(entry.get('duration') or 0)
                total_duration += e_dur
                e_thumb = entry.get('thumbnail') or ""
                if e_thumb.startswith("//"):
                    e_thumb = f"https:{e_thumb}"
                entries.append({
                    "id": eid,
                    "title": e_title,
                    "url": e_url,
                    "duration": e_dur,
                    "duration_str": format_seconds(e_dur),
                    "thumbnail": e_thumb,
                    "uploader": entry.get('uploader') or info.get('uploader') or ""
                })

            playlist_thumb = info.get('thumbnail') or (entries[0]['thumbnail'] if entries else "")
            if playlist_thumb.startswith("//"):
                playlist_thumb = f"https:{playlist_thumb}"
            title = info.get('title') or "Untitled Playlist"
            uploader = info.get('uploader') or info.get('channel') or info.get('creator') or "Unknown Creator"

            playlist_video_formats = [
                MediaFormat(format_id="best", ext="mp4", resolution="Best Quality (Auto)", label="Best Video (Up to 4K / 1080p)", has_video=True, has_audio=True),
                MediaFormat(format_id="1080p", ext="mp4", resolution="1080p FHD", label="1080p Full HD", has_video=True, has_audio=True),
                MediaFormat(format_id="720p", ext="mp4", resolution="720p HD", label="720p HD", has_video=True, has_audio=True),
                MediaFormat(format_id="480p", ext="mp4", resolution="480p SD", label="480p Standard", has_video=True, has_audio=True),
            ]
            playlist_audio_formats = [
                MediaFormat(format_id="mp3", ext="mp3", resolution="Audio Only", label="MP3 Universal Audio (320 kbps)", has_video=False, has_audio=True, is_audio_only=True),
                MediaFormat(format_id="m4a", ext="m4a", resolution="Audio Only", label="M4A AAC High Quality", has_video=False, has_audio=True, is_audio_only=True),
                MediaFormat(format_id="wav", ext="wav", resolution="Audio Only", label="Lossless WAV Audio", has_video=False, has_audio=True, is_audio_only=True),
            ]

            return MediaMetadata(
                id=str(info.get('id', 'playlist')),
                url=url,
                title=title,
                platform=self.detect_platform(url),
                uploader=uploader,
                uploader_url=info.get('uploader_url') or "",
                duration=total_duration,
                duration_str=format_seconds(total_duration),
                thumbnail=playlist_thumb,
                description=f"Playlist with {len(entries)} items.",
                formats=playlist_video_formats,
                audio_formats=playlist_audio_formats,
                webpage_url=info.get('webpage_url', url),
                original_url=url,
                is_playlist=True,
                playlist_count=len(entries),
                playlist_entries=entries
            )

        # Single Media Extraction
        title = info.get('title') or "Untitled Media"
        uploader = info.get('uploader') or info.get('channel') or info.get('creator') or "Unknown Creator"
        uploader_url = info.get('uploader_url') or ""
        duration = int(info.get('duration') or 0)
        duration_str = format_seconds(duration)
        thumbnail = info.get('thumbnail') or ""
        if thumbnail.startswith("//"):
            thumbnail = f"https:{thumbnail}"
        description = info.get('description') or ""
        if len(description) > 300:
            description = description[:300] + "..."

        raw_formats = info.get('formats') or []
        parsed_video_formats = self._parse_video_formats(raw_formats, duration)
        parsed_audio_formats = self._parse_audio_formats(raw_formats, duration)

        return MediaMetadata(
            id=str(info.get('id', 'media')),
            url=url,
            title=title,
            platform=self.detect_platform(url),
            uploader=uploader,
            uploader_url=uploader_url,
            duration=duration,
            duration_str=duration_str,
            thumbnail=thumbnail,
            description=description,
            formats=parsed_video_formats,
            audio_formats=parsed_audio_formats,
            webpage_url=info.get('webpage_url', url),
            original_url=url,
            is_playlist=False,
            playlist_count=0,
            playlist_entries=[]
        )


    def _parse_video_formats(self, raw_formats: List[Dict[str, Any]], duration: int) -> List[MediaFormat]:
        """
        Groups and deduplicates formats into clean, user-selectable resolutions:
        4K (2160p), 1440p, 1080p, 720p, 480p, 360p, 240p, and Best Available.
        Prioritizes actual stream file sizes reported by yt-dlp over synthetic formulas,
        accurately includes audio stream overhead, and matches yt-dlp's codec selection (AV1/VP9).
        """
        resolutions_found = {}  # height -> best format dict
        has_any_video = False

        # First calculate the best available audio stream size for merged video+audio estimates
        best_audio_fs = 0
        for f in raw_formats:
            if f.get('vcodec') == 'none' and f.get('acodec') != 'none':
                fs = f.get('filesize') or f.get('filesize_approx') or 0
                if fs > best_audio_fs:
                    best_audio_fs = fs
        if best_audio_fs == 0 and duration > 0:
            best_audio_fs = int(128 * 1024 * duration / 8)

        def codec_rank(vc: str) -> int:
            if not vc or vc == 'none':
                return 0
            vc_lower = vc.lower()
            if 'av01' in vc_lower or 'av1' in vc_lower:
                return 3
            if 'vp9' in vc_lower or 'vp09' in vc_lower:
                return 2
            if 'avc' in vc_lower or 'h264' in vc_lower:
                return 1
            return 0

        # Modern web video bitrate targets (kbps) when filesize is unavailable
        bitrate_map = {
            2160: 3500,
            1440: 1800,
            1080: 950,
            720: 550,
            480: 300,
            360: 180,
            240: 120,
            144: 80
        }

        for f in raw_formats:
            vcodec = f.get('vcodec') or ''
            if vcodec == 'none':
                continue  # audio only
            has_any_video = True
            h = f.get('height')
            if not h or not isinstance(h, (int, float)):
                continue
            h = int(h)
            if h <= 0:
                continue

            raw_fs = f.get('filesize') or f.get('filesize_approx') or 0
            has_real_fs = (raw_fs > 0)

            if has_real_fs:
                # If format is video-only, yt-dlp downloads best video + best audio
                total_fs = raw_fs + (best_audio_fs if f.get('acodec') == 'none' else 0)
            else:
                closest_h = min(bitrate_map.keys(), key=lambda k: abs(k - h))
                vbr = f.get('vbr') or f.get('tbr') or bitrate_map[closest_h]
                if vbr > bitrate_map[closest_h] * 1.5:
                    vbr = bitrate_map[closest_h]
                total_fs = int((vbr + 128) * 1024 * duration / 8) if duration > 0 else 0

            curr = resolutions_found.get(h)
            should_replace = False
            if not curr:
                should_replace = True
            else:
                if has_real_fs and not curr['has_real_fs']:
                    # Real reported filesize always takes precedence over synthetic estimate
                    should_replace = True
                elif has_real_fs and curr['has_real_fs']:
                    # Both have real stream sizes: prefer higher quality/efficiency codec (AV1 > VP9 > AVC)
                    if codec_rank(vcodec) > codec_rank(curr.get('vcodec')):
                        should_replace = True
                elif not has_real_fs and not curr['has_real_fs']:
                    if (f.get('ext') == 'mp4' and curr.get('ext') != 'mp4') or (codec_rank(vcodec) > codec_rank(curr.get('vcodec'))):
                        should_replace = True

            if should_replace:
                resolutions_found[h] = {
                    'format_id': f.get('format_id'),
                    'height': h,
                    'width': f.get('width', 0),
                    'ext': 'mp4',
                    'filesize': total_fs,
                    'has_real_fs': has_real_fs,
                    'fps': f.get('fps'),
                    'vcodec': vcodec,
                    'acodec': f.get('acodec', ''),
                }

        video_formats: List[MediaFormat] = []

        # Target standard bucket heights in descending order
        standard_targets = [2160, 1440, 1080, 720, 480, 360, 240, 144]
        used_heights = set()

        for target_h in standard_targets:
            # find closest available height within +/- 15%
            matched_h = None
            for h in sorted(resolutions_found.keys(), reverse=True):
                if h in used_heights:
                    continue
                if abs(h - target_h) <= (target_h * 0.15):
                    matched_h = h
                    break

            if matched_h is not None:
                used_heights.add(matched_h)
                item = resolutions_found[matched_h]
                tag = f"{target_h}p"
                if target_h >= 2160:
                    tag = "4K UHD (2160p)"
                elif target_h >= 1440:
                    tag = "2K QHD (1440p)"
                elif target_h >= 1080:
                    tag = "1080p FHD"
                elif target_h >= 720:
                    tag = "720p HD"

                fs = item['filesize']
                fs_str = format_bytes(fs) if fs > 0 else "Adaptive"

                # Selector instructs yt-dlp to grab best video up to this height + best audio,
                # with fallback to lower quality audio or silent video so merging never blocks resolution
                selector = f"bestvideo[height<={matched_h}]+bestaudio/bestvideo[height<={matched_h}]+ba/best[height<={matched_h}]/bestvideo[height<={matched_h}]/best"

                video_formats.append(MediaFormat(
                    format_id=selector,
                    ext="mp4",
                    resolution=f"{item.get('width', matched_h*16//9)}x{matched_h}",
                    label=f"{tag} • MP4",
                    filesize_approx=fs,
                    filesize_str=fs_str,
                    vcodec=item.get('vcodec', ''),
                    acodec=item.get('acodec', ''),
                    fps=item.get('fps'),
                    has_video=True,
                    has_audio=True,
                    is_audio_only=False,
                    raw_info=item
                ))

        # Add remaining unique heights if any (e.g. non-standard aspect ratios, vertical shorts)
        for h in sorted(resolutions_found.keys(), reverse=True):
            if h not in used_heights and h >= 144:
                item = resolutions_found[h]
                fs = item['filesize']
                selector = f"bestvideo[height<={h}]+bestaudio/bestvideo[height<={h}]+ba/best[height<={h}]/bestvideo[height<={h}]/best"
                video_formats.append(MediaFormat(
                    format_id=selector,
                    ext="mp4",
                    resolution=f"{item.get('width', 0)}x{h}",
                    label=f"{h}p • MP4",
                    filesize_approx=fs,
                    filesize_str=format_bytes(fs) if fs > 0 else "Adaptive",
                    has_video=True,
                    has_audio=True,
                    is_audio_only=False,
                    raw_info=item
                ))

        # Always add a Best Quality option at top if formats exist or if source has video
        if video_formats:
            video_formats.insert(0, MediaFormat(
                format_id="bestvideo+bestaudio/bestvideo+ba/best[ext=mp4]/bestvideo/best",
                ext="mp4",
                resolution="Maximum Quality",
                label="Best Available Quality (Recommended)",
                filesize_approx=video_formats[0].filesize_approx,
                filesize_str=video_formats[0].filesize_str,
                has_video=True,
                has_audio=True,
                is_audio_only=False,
                raw_info=video_formats[0].raw_info
            ))
        elif has_any_video:
            video_formats.append(MediaFormat(
                format_id="best",
                ext="mp4",
                resolution="Source",
                label="Best Quality • MP4",
                filesize_approx=0,
                filesize_str="Direct Stream",
                has_video=True,
                has_audio=True,
                is_audio_only=False
            ))

        return video_formats

    def _parse_audio_formats(self, raw_formats: List[Dict[str, Any]], duration: int) -> List[MediaFormat]:
        """
        Creates audio download format options: MP3, M4A, WAV, Opus.
        Computes realistic final file sizes on disk based on codec and duration:
        - WAV: Uncompressed 16-bit 44.1kHz stereo PCM (~176.4 KB/s)
        - MP3: High-quality 320 kbps CBR (~40 KB/s)
        - M4A: Source AAC audio stream (typically 128 kbps)
        - Opus: Source Opus audio stream (typically 160 kbps)
        """
        # Best source audio stream overall
        best_audio_fs = 0
        best_audio_tbr = 0

        # Specific search for native M4A / AAC streams
        best_m4a_fs = 0
        best_m4a_tbr = 0

        # Specific search for native Opus / WebM streams
        best_opus_fs = 0
        best_opus_tbr = 0

        for f in raw_formats:
            if f.get('vcodec') == 'none' and f.get('acodec') != 'none':
                fs = f.get('filesize') or f.get('filesize_approx') or 0
                tbr = f.get('abr') or f.get('tbr') or 0
                ext = (f.get('ext') or '').lower()
                acodec = (f.get('acodec') or '').lower()

                if fs > best_audio_fs:
                    best_audio_fs = fs
                if tbr > best_audio_tbr:
                    best_audio_tbr = tbr

                # Check if AAC / M4A stream
                if ext == 'm4a' or 'mp4a' in acodec or 'aac' in acodec:
                    if fs > best_m4a_fs:
                        best_m4a_fs = fs
                    if tbr > best_m4a_tbr:
                        best_m4a_tbr = tbr

                # Check if Opus / WebM stream
                if 'opus' in acodec or ext in ('webm', 'opus'):
                    if fs > best_opus_fs:
                        best_opus_fs = fs
                    if tbr > best_opus_tbr:
                        best_opus_tbr = tbr

        if best_audio_fs == 0 and duration > 0:
            rate = best_audio_tbr if best_audio_tbr > 0 else 128
            best_audio_fs = int(rate * 1024 * duration / 8)

        # Baseline network stream download size
        net_fs = best_audio_fs if best_audio_fs > 0 else (int(128 * 1024 * duration / 8) if duration > 0 else 0)

        # Distinct M4A stream size:
        if best_m4a_fs > 0:
            m4a_fs = best_m4a_fs
        elif best_m4a_tbr > 0 and duration > 0:
            m4a_fs = int(best_m4a_tbr * 1024 * duration / 8)
        elif duration > 0:
            m4a_fs = int(128 * 1024 * duration / 8)
        else:
            m4a_fs = net_fs

        # Distinct Opus stream size:
        if best_opus_fs > 0:
            opus_fs = best_opus_fs
        elif best_opus_tbr > 0 and duration > 0:
            opus_fs = int(best_opus_tbr * 1024 * duration / 8)
        elif duration > 0:
            opus_fs = int(160 * 1024 * duration / 8)
        else:
            opus_fs = net_fs

        # Realistic post-conversion disk file sizes:
        # WAV is 16-bit 44.1kHz stereo PCM = 44100 * 2 channels * 2 bytes/sample = 176,400 bytes/sec
        wav_fs = int(176400 * duration) if duration > 0 else (net_fs * 10 if net_fs > 0 else 0)
        # MP3 re-encoded at 320 kbps CBR = 320,000 bits / 8 = 40,000 bytes/sec
        mp3_fs = int(40000 * duration) if duration > 0 else (net_fs * 2 if net_fs > 0 else 0)

        m4a_kbps = round(best_m4a_tbr) if best_m4a_tbr > 0 else 128
        opus_kbps = round(best_opus_tbr) if best_opus_tbr > 0 else 160

        audio_options = [
            ("mp3", "MP3 Audio (Universal 320 kbps)", mp3_fs, f"{format_bytes(mp3_fs)} • 320 kbps MP3" if mp3_fs > 0 else "320 kbps Universal"),
            ("m4a", "M4A Audio (Apple / AAC Quality)", m4a_fs, f"{format_bytes(m4a_fs)} • Source AAC ({m4a_kbps} kbps)" if m4a_fs > 0 else "Source AAC"),
            ("wav", "WAV Audio (Uncompressed Lossless)", wav_fs, f"{format_bytes(wav_fs)} • 1411 kbps PCM" if wav_fs > 0 else "Lossless PCM"),
            ("opus", "Opus Audio (Best Web Codec)", opus_fs, f"{format_bytes(opus_fs)} • Source Opus ({opus_kbps} kbps)" if opus_fs > 0 else "Source Opus"),
        ]

        result = []
        for codec, label, fs, note in audio_options:
            result.append(MediaFormat(
                format_id=f"audio_{codec}",
                ext=codec,
                resolution="Audio",
                label=label,
                filesize_approx=fs,
                filesize_str=note,
                has_video=False,
                has_audio=True,
                is_audio_only=True
            ))
        return result

    def get_formats(self, url: str) -> List[MediaFormat]:
        meta = self.get_metadata(url)
        return meta.formats

    def download(
        self,
        url: str,
        format_id: str,
        output_dir: str,
        filename_template: str,
        is_audio: bool,
        audio_format: str,
        on_progress: Callable[[Dict[str, Any]], None],
        cancel_check: Callable[[], bool],
        title: str = ""
    ) -> Dict[str, Any]:
        os.makedirs(output_dir, exist_ok=True)
        final_file_info = {}
        target_codec = audio_format.lower() if audio_format else "mp3"

        def ytdl_hook(d):
            if cancel_check():
                raise Exception("Download cancelled by user.")

            status = d.get('status')
            if status == 'downloading':
                downloaded = d.get('downloaded_bytes') or 0
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                speed = d.get('speed') or 0
                eta = d.get('eta') or 0

                percent = 0.0
                if total > 0:
                    percent = round((downloaded / total) * 100, 1)

                speed_str = f"{format_bytes(int(speed))}/s" if speed > 0 else "-- KB/s"
                eta_str = format_seconds(int(eta)) if eta > 0 else "--:--"

                on_progress({
                    "status": "downloading",
                    "percent": percent,
                    "downloaded_bytes": downloaded,
                    "total_bytes": total,
                    "speed_str": speed_str,
                    "eta_str": eta_str
                })
            elif status == 'finished':
                fn = d.get('filename')
                if fn:
                    final_file_info['finished_path'] = fn
                on_progress({
                    "status": "processing",
                    "percent": 99.0,
                    "downloaded_bytes": d.get('total_bytes', 0),
                    "total_bytes": d.get('total_bytes', 0),
                    "speed_str": f"Encoding {target_codec.upper()}..." if is_audio else "Merging / Finalizing",
                    "eta_str": "A few seconds"
                })

        def ytdl_postprocessor_hook(d):
            if d.get('status') == 'finished':
                fn = d.get('info_dict', {}).get('filepath') or d.get('filepath')
                if fn and os.path.exists(fn):
                    final_file_info['final_path'] = fn

        # Determine target extension and unique filename to prevent yt-dlp skipping duplicate downloads
        target_ext = f".{audio_format.lower() if audio_format else 'mp3'}" if is_audio else ".mp4"
        clean_title = sanitize_filename(title.strip() if title else "", max_length=150) if title else ""
        chosen_stem = ""
        if clean_title and clean_title.lower() not in ("analyzing...", "web media", "unknown"):
            candidate = f"{clean_title}{target_ext}"
            unique_name = get_unique_filename(output_dir, candidate)
            chosen_stem = Path(unique_name).stem

        if chosen_stem:
            outtmpl = os.path.join(output_dir, f"{chosen_stem}.%(ext)s")
        else:
            outtmpl = os.path.join(output_dir, '%(title).150s.%(ext)s')

        # Base YDL options
        ydl_opts: Dict[str, Any] = {
            'outtmpl': outtmpl,
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'socket_timeout': 15,
            'retries': 5,
            'fragment_retries': 5,
            'extractor_retries': 5,
            'file_access_retries': 3,
            'overwrites': True,        # CRITICAL: Always overwrite target stem so yt-dlp never skips download
            'continuedl': False,
            'progress_hooks': [ytdl_hook],
            'postprocessor_hooks': [ytdl_postprocessor_hook],
            'restrictfilenames': False,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
            }
        }
        if self.js_runtimes:
            ydl_opts['js_runtimes'] = self.js_runtimes
        if sys.platform == 'win32':
            ydl_opts['windowsfilenames'] = True

        cookie_file = self._locate_cookie_file()
        if cookie_file:
            ydl_opts['cookiefile'] = cookie_file
        else:
            cookie_browser = self._get_cookie_browser()
            if cookie_browser:
                ydl_opts['cookiesfrombrowser'] = (cookie_browser,)

        has_ffmpeg = bool(self.ffmpeg_path and os.path.exists(self.ffmpeg_path))
        if has_ffmpeg:
            ydl_opts['ffmpeg_location'] = self.ffmpeg_path

        if is_audio:
            target_codec = audio_format.lower() if audio_format else "mp3"
            # Prioritize genuine audio-only streams matching target codec to minimize transcoding loss
            if target_codec == 'm4a':
                ydl_opts['format'] = 'bestaudio[ext=m4a]/bestaudio/best'
            elif target_codec == 'opus':
                ydl_opts['format'] = 'bestaudio[ext=webm]/bestaudio/best'
            else:
                ydl_opts['format'] = 'bestaudio/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
            if has_ffmpeg:
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': target_codec,
                    'preferredquality': '320',
                }]
        else:
            # Video mode format selection
            f_norm = (format_id or '').strip().lower()
            if not f_norm or f_norm in ('best', 'auto', 'default'):
                if has_ffmpeg:
                    ydl_opts['format'] = 'bestvideo+bestaudio/bestvideo+ba/best[ext=mp4]/bestvideo/best'
                    ydl_opts['merge_output_format'] = 'mp4'
                else:
                    ydl_opts['format'] = 'best[ext=mp4]/best/bestvideo+bestaudio'
            elif f_norm in ('2160p', '4k'):
                ydl_opts['format'] = 'bestvideo[height<=2160]+bestaudio/bestvideo[height<=2160]+ba/best[height<=2160]/bestvideo[height<=2160]/best' if has_ffmpeg else 'best[height<=2160]/best'
                if has_ffmpeg:
                    ydl_opts['merge_output_format'] = 'mp4'
            elif f_norm in ('1440p', '2k'):
                ydl_opts['format'] = 'bestvideo[height<=1440]+bestaudio/bestvideo[height<=1440]+ba/best[height<=1440]/bestvideo[height<=1440]/best' if has_ffmpeg else 'best[height<=1440]/best'
                if has_ffmpeg:
                    ydl_opts['merge_output_format'] = 'mp4'
            elif f_norm == '1080p':
                ydl_opts['format'] = 'bestvideo[height<=1080]+bestaudio/bestvideo[height<=1080]+ba/best[height<=1080]/bestvideo[height<=1080]/best' if has_ffmpeg else 'best[height<=1080]/best'
                if has_ffmpeg:
                    ydl_opts['merge_output_format'] = 'mp4'
            elif f_norm == '720p':
                ydl_opts['format'] = 'bestvideo[height<=720]+bestaudio/bestvideo[height<=720]+ba/best[height<=720]/bestvideo[height<=720]/best' if has_ffmpeg else 'best[height<=720]/best'
                if has_ffmpeg:
                    ydl_opts['merge_output_format'] = 'mp4'
            elif f_norm == '480p':
                ydl_opts['format'] = 'bestvideo[height<=480]+bestaudio/bestvideo[height<=480]+ba/best[height<=480]/bestvideo[height<=480]/best' if has_ffmpeg else 'best[height<=480]/best'
                if has_ffmpeg:
                    ydl_opts['merge_output_format'] = 'mp4'
            elif f_norm == '360p':
                ydl_opts['format'] = 'bestvideo[height<=360]+bestaudio/bestvideo[height<=360]+ba/best[height<=360]/bestvideo[height<=360]/best' if has_ffmpeg else 'best[height<=360]/best'
                if has_ffmpeg:
                    ydl_opts['merge_output_format'] = 'mp4'
            else:
                # Custom or selector string (e.g. from single download format picker)
                if has_ffmpeg:
                    if '+' in format_id and not format_id.endswith('/best'):
                        ydl_opts['format'] = f"{format_id}/bestvideo+bestaudio/best"
                    else:
                        ydl_opts['format'] = f"{format_id}/best"
                    ydl_opts['merge_output_format'] = 'mp4'
                else:
                    ydl_opts['format'] = f"{format_id}/best[ext=mp4]/best/bestvideo+bestaudio"

        ytdlp_mod = get_yt_dlp()
        try:
            with ytdlp_mod.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except Exception as e:
            # Clean up partial files from aborted or errored download
            try:
                for fn in os.listdir(output_dir):
                    if fn.endswith('.part') or '.temp' in fn:
                        fp = os.path.join(output_dir, fn)
                        if os.path.isfile(fp):
                            os.remove(fp)
            except Exception:
                pass
            if cancel_check():
                raise Exception("Download cancelled by user.")
            err_dict = humanize_error(str(e))
            raise ValueError(f"{err_dict['friendly']}|SPLIT|{err_dict.get('suggestion', '')}|SPLIT|{err_dict['technical']}")

        # Determine output file path
        saved_file = None
        if chosen_stem:
            target_cand = os.path.join(output_dir, f"{chosen_stem}{target_ext}")
            if os.path.exists(target_cand):
                saved_file = target_cand

        if not saved_file and 'final_path' in final_file_info and os.path.exists(final_file_info['final_path']):
            saved_file = final_file_info['final_path']
        elif not saved_file and 'finished_path' in final_file_info and os.path.exists(final_file_info['finished_path']):
            saved_file = final_file_info['finished_path']
        elif not saved_file and info:
            # Check requested_downloads or default prepared filename
            if 'requested_downloads' in info and len(info['requested_downloads']) > 0:
                saved_file = info['requested_downloads'][0].get('filepath')
            if not saved_file or not os.path.exists(saved_file):
                expected = ydl.prepare_filename(info)
                if is_audio:
                    base, _ = os.path.splitext(expected)
                    expected = f"{base}.{audio_format.lower()}"
                elif has_ffmpeg:
                    base, _ = os.path.splitext(expected)
                    expected = f"{base}.mp4"

                saved_file = resolve_existing_path(expected)

        if not saved_file or not os.path.exists(saved_file):
            if 'final_path' in final_file_info:
                saved_file = resolve_existing_path(final_file_info['final_path'])
            elif 'finished_path' in final_file_info:
                saved_file = resolve_existing_path(final_file_info['finished_path'])

        if not saved_file or not os.path.exists(saved_file):
            # Scan directory for the most recently modified file in output_dir
            files = [os.path.join(output_dir, f) for f in os.listdir(output_dir) if not f.endswith('.part')]
            if files:
                saved_file = max(files, key=os.path.getmtime)

        if not saved_file or not os.path.exists(saved_file):
            raise Exception("Download completed but destination file could not be located.")

        final_size = os.path.getsize(saved_file)
        filename = os.path.basename(saved_file)

        on_progress({
            "status": "completed",
            "percent": 100.0,
            "downloaded_bytes": final_size,
            "total_bytes": final_size,
            "speed_str": "Finished",
            "eta_str": "00:00"
        })

        return {
            "file_path": saved_file,
            "filename": filename,
            "file_size": final_size,
            "file_size_str": format_bytes(final_size)
        }

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name="yt-dlp Universal Engine",
            can_extract_metadata=True,
            can_stream_download=True,
            supports_quality_selection=True,
            supports_audio_extraction=True,
            supported_audio_codecs=["mp3", "m4a", "wav", "opus"]
        )






