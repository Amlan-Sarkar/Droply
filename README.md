<div align="center">

# ⚡ Droply

**Universal High-Performance Video, Audio & Social Media Downloader for Windows**

*Download videos, Reels, Shorts, and audio from YouTube, Instagram, TikTok, X (Twitter), Bilibili, and 1,000+ sites at full quality with real-time speed & progress tracking.*

[![Latest Release](https://img.shields.io/github/v/release/Amlan-Sarkar/Droply?color=6366f1&label=Release&style=flat-square)](https://github.com/Amlan-Sarkar/Droply/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-00d2ff.svg?style=flat-square)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0e121a.svg?style=flat-square&logo=windows)](https://github.com/Amlan-Sarkar/Droply/releases)
[![Execution: 100% Local](https://img.shields.io/badge/Privacy-100%25%20Local-10b981.svg?style=flat-square)](https://github.com/Amlan-Sarkar/Droply)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)

[**Download Windows App**](https://github.com/Amlan-Sarkar/Droply/releases/latest) • [**Features**](#-features) • [**Quick Start (No Python Required)**](#-quick-start-no-python-required) • [**How to Use**](#-how-to-use) • [**Developer Guide**](#-developer-quick-start)

</div>

---

<!-- UI Screenshot Placeholder: Upload your screenshot to your repo or assets folder and link it here -->
<!-- <div align="center"><img src="assets/droply-preview.png" alt="Droply UI Preview" width="850"></div> -->

---

## ✨ Features

- **🌐 Universal Platform Coverage**: Extract media seamlessly across:
  - **YouTube**: Videos and Shorts up to 4K UHD 60fps with automatic high-bitrate stream merging.
  - **Instagram**: Reels, Stories, Posts, and Carousel video clips.
  - **TikTok**: Crisp high-definition video without platform watermarks.
  - **Twitter / X**: Video posts, status clips, and embedded media threads.
  - **Bilibili**: High-resolution video and animated episodes.
  - **Facebook, Reddit, Pinterest, Twitch, Vimeo, SoundCloud**, and 1,000+ supported sites.
  - **Direct Links**: Direct `.mp4`, `.webm`, `.mp3`, and `.wav` streaming links with multi-part acceleration.
- **⚡ Real-Time Progress & Speed Tracking**: Millisecond-accurate live progress bar, real-time download speed (`MB/s`), downloaded file size counter, and dynamic Estimated Time of Arrival (ETA).
- **🎧 High-Fidelity Audio Extraction**: Built-in audio conversion supporting **MP3 (320 kbps High Quality)**, **Apple AAC (M4A)**, **Lossless WAV**, and **Opus**.
- **📑 Smart Multi-Link Batch Downloader**: Paste multiple URLs at once (one per line or comma-separated), automatically parse valid links, apply global quality presets, and manage downloads concurrently.
- **🎬 Authentic Quality Selection**: Dynamically detects and displays only genuine available qualities (4K UHD, 2K QHD, 1080p FHD, 720p HD, 480p, 360p) with container details and estimated file sizes.
- **🏷️ Clean Windows Filename Sanitization**: Automatically preserves authentic media titles while removing reserved filesystem characters (`:`, `*`, `?`, `"`, `<`, `>`, `|`) and prevents accidental file overwriting.
- **📁 Local History & 1-Click File Explorer**: Preserves download logs with 1-click **"Reveal in Explorer"** and **"Play File"** shortcuts.
- **🎨 Modern Glassmorphic Dark UI**: Clean desktop design with vibrant glowing accents, smooth transitions, and 4 curated themes (*Neon Midnight*, *OLED Pure Black*, *Cyberpunk Cyan*, and *Nordic Slate*).
- **🛡️ 100% Local & Privacy-Focused**: Runs completely on your PC. No third-party servers, zero telemetry, no login accounts, and no data tracking.

---

## 📦 Quick Start (No Python Required!)

For standard Windows users, Droply is distributed as a pre-built standalone desktop application that runs out-of-the-box without installing Python:

### 1. Download
1. Head over to the [**Latest GitHub Releases**](https://github.com/Amlan-Sarkar/Droply/releases/latest) page.
2. Under **Assets**, download **`Droply-Windows-x64.zip`**.

### 2. Launch
1. Extract the downloaded `.zip` file anywhere on your computer (e.g., Desktop or Documents).
2. Double-click **`Droply.exe`**.
3. **Droply opens immediately as a desktop application window!**

---

## 🎯 How to Use

1. **Paste a Link**: Copy any media URL and paste it into the search bar (or click the **Paste** button).
2. **Instant Detection**: Droply instantly detects the platform origin (YouTube, Twitter/X, TikTok, Instagram, etc.).
3. **Analyze**: Click **Analyze** (or press <kbd>Enter</kbd>) to load media details, thumbnail, and duration.
4. **Choose Format**:
   - **Video Mode**: Select your desired quality (`Best Quality`, `1080p`, `720p`, etc.).
   - **Audio Mode**: Switch to Audio mode and select your format (`MP3 320k`, `M4A`, `WAV`).
5. **Download**: Click **Download Media**.
6. **Open File**: When completed, click **Open Containing Folder** to reveal your downloaded media in Windows Explorer, or **Play File** to watch it immediately!

---

## 💻 Developer Quick Start

If you are a developer looking to run or build Droply from source:

### Prerequisites
- Windows 10 or 11
- Python 3.10+
- Git

### Run from Source
```powershell
# 1. Clone the repository
git clone https://github.com/Amlan-Sarkar/Droply.git
cd Droply

# 2. Install dependencies
pip install -r requirements.txt

# 3. Launch application (or double-click start.bat)
python app.py
```

---

## ⚖️ Legal Disclaimer & Fair Use Notice

Droply is an open-source tool intended strictly for personal archival, educational, and authorized fair-use purposes (such as downloading public content you own, have created, or have explicit permission to access offline). 

Users are solely responsible for complying with applicable copyright laws, platform Terms of Service, and intellectual property rights. Droply does not bypass DRM (Digital Rights Management), paywalls, or private authentication barriers.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
