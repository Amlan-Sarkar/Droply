<div align="center">

<img src="assets/logo.png" width="160" alt="Droply Logo">

<br>

**Universal High-Performance Video, Audio & Social Media Downloader for Windows & Android**

*Download videos, Reels, Shorts, and audio from YouTube, Instagram, TikTok, X (Twitter), Bilibili, and popular media sites with real-time speed & progress tracking.*

[![Latest Release](https://img.shields.io/badge/Release-v1.2.2-6366f1.svg?style=flat-square)](https://github.com/Amlan-Sarkar/Droply/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-00d2ff.svg?style=flat-square)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Windows-10%20%7C%2011%20(Stable)-0078d4.svg?style=flat-square&logo=windows)](https://github.com/Amlan-Sarkar/Droply/releases)
[![Platform: Android](https://img.shields.io/badge/Android-Experimental-f59e0b.svg?style=flat-square&logo=android)](https://github.com/Amlan-Sarkar/Droply/releases)
[![Execution: 100% Local](https://img.shields.io/badge/Privacy-100%25%20Local-10b981.svg?style=flat-square)](https://github.com/Amlan-Sarkar/Droply)

[**Download Releases**](#-quick-start-downloads) • [**Features**](#-features) • [**Supported Sources**](#-supported-sources) • [**Platform Support**](#-platform-support--compatibility) • [**How to Use**](#-how-to-use)

</div>

---

## ✨ Features

- **🌐 Broad Media Extraction**: Extract videos and audio from YouTube, Instagram, TikTok, X (Twitter), Facebook, Reddit, Bilibili, Vimeo, SoundCloud, and direct media URLs.
- **⚡ Real-Time Progress & Speed Tracking**: Millisecond-accurate live progress bar, active download speed (`MB/s`), downloaded file size counter, and dynamic Estimated Time of Arrival (ETA).
- **🎶 High-Fidelity Audio Extraction**: Built-in audio conversion supporting **MP3 (320 kbps High Quality)**, **Apple AAC (M4A)**, and **Lossless WAV**.
- **📁 Smart Playlist Downloader**: Detects full playlists and albums, automatically creating a dedicated subfolder named after the playlist in your download directory to keep files organized.
- **📑 Multi-Link Batch Queue**: Paste multiple URLs at once (one per line or comma-separated), parse valid links, apply global presets, and track batch progress with live queue counters.
- **🎬 Quality & Format Selection**: Detects genuine available stream resolutions (4K UHD, 2K QHD, 1080p FHD, 720p HD, 480p, 360p, or Best Auto) with container details and estimated file sizes.
- **🏷️ Clean Filename Sanitization**: Automatically preserves authentic media titles while removing reserved filesystem characters (`:`, `*`, `?`, `"`, `<`, `>`, `|`) and prevents accidental file overwrites.
- **📜 Local History & 1-Click File Explorer**: Stores download history with quick shortcuts to **"Open Containing Folder"** and **"Play File"**.
- **🎨 Glassmorphic Dark UI**: Clean interface with glowing accents, responsive layout, and 4 curated themes (*Neon Midnight*, *OLED Pure Black*, *Cyberpunk Cyan*, and *Nordic Slate*).
- **🛡️ 100% Local & Privacy-Focused**: Runs completely on your device. No third-party proxy servers, zero telemetry, no user accounts, and no data tracking.

---

## 🌐 Supported Sources

Droply supports media extraction across major video, audio, and social streaming platforms:

| Source | Supported Media Types | Quality & Notes |
| :--- | :--- | :--- |
| **YouTube** | Videos, Shorts, Music & Playlists | Up to 4K UHD 60fps with automatic high-bitrate video/audio stream merging *(Windows)* |
| **Instagram** | Reels, Stories, Posts & Carousels | Clean MP4 video clips & high-resolution images |
| **TikTok** | Video posts & Audio clips | Clean high-definition video streams without platform watermarks |
| **Twitter / X** | Video tweets, clips & GIF loops | Best available progressive MP4 bitrate streams |
| **Facebook** | Public watch videos & Reels | High-definition and standard MP4 streams |
| **Reddit** | Hosted video posts (`v.redd.it`) | Automatic video and audio track merging |
| **Bilibili** | Videos & animation clips | High-resolution streaming media |
| **Vimeo** | Showcase & portfolio videos | Adaptive MP4 streams |
| **SoundCloud** | Audio tracks & full albums | High-quality audio extraction |
| **Direct Links** | Direct `.mp4`, `.webm`, `.mp3`, `.wav` | Accelerated streaming chunk downloads |

---

## 📋 Platform Support & Compatibility

Droply focuses officially on two platforms: **Windows (Stable)** as the primary desktop experience and **Android (Experimental)** for mobile testing.

| Platform | Status | Min OS Version | Architecture | System Requirements | Capabilities & Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 🪟 **Windows** | **Stable** *(Primary)* | Windows 10 (1809+) or Windows 11 | x86_64 | Microsoft Edge WebView2, .NET Framework 4.5+ | **Full Engine**: `yt-dlp` + bundled FFmpeg. Supports 4K stream merging, 320k audio conversion, playlist folders, and native taskbar integration. Tested on Windows 11. |
| 🤖 **Android** | **Experimental** *(Testing)* | Android 7.0+ (Nougat, API 24+) | `arm64-v8a`, `armeabi-v7a`, `x86_64` | Android System WebView | **Under Validation**: Embedded Python 3.11 with `yt-dlp`. Downloads best progressive streams (up to 720p HD) and audio. Storage location routing and queue flows are experimental. |

> [!WARNING]
> **Android Experimental Notice:**
> The Android release is currently provided for community testing and early feedback. Core download operations, folder navigation, batch queue behavior, and file storage locations are undergoing active debugging and validation. Expect occasional instability while mobile engine issues are being addressed.

---

## 📦 Quick Start (Downloads)

Pre-compiled standalone packages are available below. **No Python or development tools are required.**

### 🪟 Windows (Stable — Primary Release)

| Package | Format | Direct Download |
| :--- | :--- | :--- |
| **Droply Setup Wizard** *(Recommended)* | `.exe` Modern Setup | [**Download Droply-Setup.exe**](https://github.com/Amlan-Sarkar/Droply/releases/latest/download/Droply-Setup.exe) |
| **Droply Portable Archive** | Standalone `.zip` | [**Download Droply-Windows-x64.zip**](https://github.com/Amlan-Sarkar/Droply/releases/latest/download/Droply-Windows-x64.zip) |

#### Installing and Launching on Windows:
- **Setup Wizard (Recommended):** Download and run **`Droply-Setup.exe`**. It installs without administrator prompts, places Droply into your Start Menu, Windows Search, and Desktop, and supports clean updates.
- **Portable Zip:** Download and extract **`Droply-Windows-x64.zip`**, then run **`Droply.exe`** directly without installation.
*(If Microsoft Edge WebView2 is not installed, Droply automatically opens the interface in your default web browser).*

---

### 🤖 Android (Experimental — Testing Only)

| Package | Supported ABIs | Direct Download |
| :--- | :--- | :--- |
| **Droply for Android** | `arm64-v8a`, `armeabi-v7a`, `x86_64` | [**Download Droply-Android.apk**](https://github.com/Amlan-Sarkar/Droply/releases/latest/download/Droply-Android.apk) |

#### Installing on Android:
1. Download **`Droply-Android.apk`** to your device.
2. Tap the APK file to install. If prompted, grant permission to *"Install unknown apps"*.
3. Open Droply from your app drawer.
4. *Share Sheet*: You can share links directly from the YouTube or social app share menu to Droply.
   *(Note: Storage routing and file management are currently experimental; downloaded files can be located in your device's media player or public `Download/Droply` directory).*

---

## 🎯 How to Use

### 1. Single Media Downloader
1. **Copy Link**: Copy any video, reel, post, or audio link from your browser or mobile app.
2. **Paste**: Paste the URL into the search bar (or click the **Paste** button).
3. **Analyze**: Click **Analyze** (or press <kbd>Enter</kbd>) to preview title, uploader, thumbnail, and duration.
4. **Select Format**:
   * **Video Mode**: Choose your preferred quality (`Best Available`, `1080p`, `720p`, etc.).
   * **Audio Mode**: Switch to Audio mode to extract in `MP3 (320 kbps HQ)`, `M4A`, or `WAV`.
5. **Download**: Click **Download Media**. Watch live progress, download speed, and ETA.
6. **Open File**: Once complete, click **Open Containing Folder** to reveal your file or **Play File** to play it immediately.

### 2. Playlists & Albums
* Paste a YouTube playlist, album, or series URL into the search bar.
* Droply detects playlist links and displays the item count.
* On download, Droply automatically creates a **dedicated folder named after the playlist** inside your download directory so all items remain organized.

### 3. Multi-Link Batch Queue
1. Open the **Batch Downloader** tab.
2. Paste multiple links (one per line or comma-separated).
3. Click **Add URLs to Queue**.
4. Droply parses all valid URLs, enqueues them, and processes them with live progress feedback.
5. Click **Clear Completed** anytime to reset finished tasks and refresh the queue counter.

### 4. Library & History
* Open the **Library & History** tab to view your past downloads.
* Open files directly, reveal their exact folder location, or clean up your download history with one click.

### 5. Personalization & Themes
* Open the **Settings** tab to choose between 4 curated themes:
  * 🌌 **Neon Midnight** (Default dark palette with indigo & violet accents)
  * 🖤 **OLED Pure Black** (Pure black for AMOLED displays)
  * ⚡ **Cyberpunk Cyan** (High-energy cyan and neon accents)
  * 🏔️ **Nordic Slate** (Muted minimalist dark aesthetic)
* Configure your preferred default download path and quality presets.

---

## ⚖️ Privacy & Legal Disclaimer

Droply is an open-source utility designed exclusively for **personal archival, educational, and authorized fair-use purposes** (such as backing up content you created, accessing public-domain material, or saving media with explicit permission from the copyright holder).

* **100% Local & Private**: All extraction and download operations execute locally on your machine. Droply contains zero telemetry, collects no personal data, and routes no traffic through third-party proxy servers.
* **Respect Copyright & Terms**: Users are solely responsible for complying with applicable copyright laws and website Terms of Service. Droply does not bypass DRM (Digital Rights Management), decrypt subscription-protected streams, or circumvent private authentication walls.

---

## 📄 License & Community

Droply is licensed under the [MIT License](LICENSE).

* 🐛 **Issues & Feedback**: [Report an issue or suggest a feature](https://github.com/Amlan-Sarkar/Droply/issues)
* 🚀 **Releases & Updates**: [View all GitHub Releases](https://github.com/Amlan-Sarkar/Droply/releases)
