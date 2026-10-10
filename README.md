# Droply — Universal Local Media Downloader
*High-Performance, Privacy-First, Local Desktop Media Engine*

![Droply](https://img.shields.io/badge/Droply-v1.0.0-6366f1)
![Platform](https://img.shields.io/badge/Platform-Windows-06b6d4)
![Python](https://img.shields.io/badge/Python-3.11+-10b981)
![Privacy](https://img.shields.io/badge/Execution-100%25%20Local-8b5cf6)

---

## ⚡ Overview

**Droply** is a sleek, ultra-fast, local-first desktop application engineered to extract, preview, convert, and download media directly to your local device. It requires **zero cloud servers**, collects no analytics, and operates with complete privacy.

Droply pairs a hardware-accelerated **FFmpeg / yt-dlp core engine** with a fluid, modern glassmorphic interface that runs as a native Windows desktop application window (powered by Microsoft Edge WebView2).

---

## ✨ Key Features

- **Instant Source Detection**: Real-time regex heuristics recognize platform origins (YouTube, Twitter/X, TikTok, Reddit, Instagram, Vimeo, SoundCloud, Twitch, Direct media files) before network requests occur.
- **Dynamic Quality & Format Discovery**: Formats are inspected dynamically from the source stream. Only genuine available resolutions (4K UHD, 2K QHD, 1080p FHD, 720p HD, 480p, 360p) and bitrates are shown.
- **Adaptive Stream Muxing**: Automatically downloads and merges separated high-bitrate video and audio streams using bundled local FFmpeg binaries.
- **Audio Extraction**: Dedicated Audio Mode supporting lossless PCM WAV, high-quality 320 kbps MP3, Apple AAC M4A, and Opus.
- **Multi-URL Batch Downloader**: Paste multiple links (one per line, comma-separated, or pasted text), parse unique URLs, configure batch quality presets, and monitor concurrent downloads.
- **Concurrent Queue Management**: Configurable background worker pool with real-time speed, progress bars, byte counters, and ETA updates over WebSockets.
- **Local Download History**: Keeps track of completed and failed downloads with instant "Reveal in Explorer" and "Play / Open" actions without touching your files upon history clearing.
- **Native Folder Browser**: Integrates directly with Windows folder selection dialogs and Explorer file highlighting (`explorer.exe /select,"path"`).
- **Human-Friendly Error Translation**: Translates obscure HTTP codes and platform restrictions into clear, actionable explanations with expandable technical details.
- **Curated Visual Aesthetics**: Glassmorphic dark design system with four switchable themes (*Neon Midnight*, *OLED Pure Black*, *Cyberpunk Cyan*, and *Nordic Slate*).

---

## 🏗️ Architecture

```
Droply
├── app.py                      # Desktop window launcher (WebView2 / Browser fallback)
├── start.bat                   # 1-Click Windows execution script
├── requirements.txt            # Python dependencies
├── engine/
│   ├── providers/
│   │   ├── base.py             # Modular provider abstract interface & dataclasses
│   │   ├── registry.py         # Provider registration & instant platform detection
│   │   ├── direct_provider.py  # Direct HTTP/HTTPS streaming media provider
│   │   └── ytdlp_provider.py   # Universal yt-dlp engine & FFmpeg integration
│   ├── file_manager.py         # Duplicate collision avoidance, filename sanitization
│   ├── queue_manager.py        # Multi-worker async queue, retry, and cancellation
│   ├── settings_manager.py     # Local configuration persistence (~/.Droply)
│   └── history_manager.py      # Local download history records (~/.Droply)
├── server/
│   └── api.py                  # FastAPI REST endpoints & WebSocket broadcaster
├── web/
│   ├── index.html              # Modern single-page desktop application UI
│   ├── css/style.css           # Glassmorphism, animations, responsive design
│   └── js/
│       ├── api.js              # Client API client & WebSocket listener
│       ├── components.js       # Dynamic format chips, queue & history cards
│       ├── theme.js            # Multi-theme manager
│       └── app.js              # State management & user flows
└── tests/
    ├── test_engine.py          # Core provider, sanitization & queue tests
    ├── test_api.py             # FastAPI REST endpoint integration tests
    └── test_real_download.py   # Live media stream extraction & download test
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python 3.10+** (Tested on Python 3.11)
- **Windows 10/11** (Microsoft Edge WebView2 is built-in)

### 2. Install Dependencies
Open PowerShell or Command Prompt in the project folder and run:
```bash
python -m pip install -r requirements.txt
```

### 3. Launch the Application

#### Option A: One-Click Launcher (Windows)
Double-click `start.bat`.

#### Option B: Native Desktop Window
```bash
python app.py
```

#### Option C: Browser Mode
```bash
python app.py --web
```

#### Option D: Headless / Server-Only Mode
```bash
python app.py --headless --port 8765
```

---

## 🧪 Running Automated Tests

Run the complete test suite:
```bash
python -m unittest discover tests
```

---

## 📦 Packaging to Standalone Executable (.exe)

To bundle Droply into an independent Windows `.exe`:
```bash
python -m pip install pyinstaller
pyinstaller --name Droply --onefile --windowed --add-data "web;web" --add-data "engine;engine" app.py
```

---

## 🔒 Privacy & Legal Boundaries

- Droply operates strictly locally on your computer.
- No user URLs, metadata, or downloaded files are ever transmitted to third-party cloud servers.
- Droply is intended for downloading authorized, publicly accessible media resources. It does not circumvent DRM, paywalls, access controls, or authentication mechanisms.

