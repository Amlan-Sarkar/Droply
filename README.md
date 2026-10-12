<div align="center">

<img src="assets/logo.png" width="160" alt="Droply Logo">

<br>

**Universal High-Performance Video, Audio & Social Media Downloader for Windows, macOS, Linux, Android & iOS**

*Download videos, Reels, Shorts, and audio from YouTube, Instagram, TikTok, X (Twitter), Bilibili, and 1,000+ sites at full quality with real-time speed & progress tracking.*

[![Latest Release](https://img.shields.io/badge/Release-v1.2.4-6366f1.svg?style=flat-square)](https://github.com/Amlan-Sarkar/Droply/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-00d2ff.svg?style=flat-square)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4.svg?style=flat-square&logo=windows)](https://github.com/Amlan-Sarkar/Droply/releases)
[![Platform: macOS](https://img.shields.io/badge/macOS-Apple%20Silicon-000000.svg?style=flat-square&logo=apple)](https://github.com/Amlan-Sarkar/Droply/releases)
[![Platform: Linux](https://img.shields.io/badge/Linux-x86__64-FCC624.svg?style=flat-square&logo=linux&logoColor=black)](https://github.com/Amlan-Sarkar/Droply/releases)
[![Platform: Android](https://img.shields.io/badge/Platform-Android%20(APK)-3ddc84.svg?style=flat-square&logo=android)](https://github.com/Amlan-Sarkar/Droply/releases)
[![Platform: iOS](https://img.shields.io/badge/Platform-iOS%20(IPA)-000000.svg?style=flat-square&logo=apple)](https://github.com/Amlan-Sarkar/Droply/releases)
[![Execution: 100% Local](https://img.shields.io/badge/Privacy-100%25%20Local-10b981.svg?style=flat-square)](https://github.com/Amlan-Sarkar/Droply)

[**Download Releases**](#-quick-start-standalone-downloads) • [**Features**](#-features) • [**Supported Sources**](#-supported-sources) • [**Platform Compatibility**](#-platform-compatibility--requirements) • [**How to Use**](#-how-to-use)

</div>

---

## ✨ Features

- **🌐 Universal Media Extraction**: Download videos, audio, and images from YouTube, Instagram, TikTok, X (Twitter), Facebook, Reddit, Bilibili, Vimeo, SoundCloud, and 1,000+ sites.
- **📱 True Multi-Platform**: Standalone, pre-compiled releases for **Windows, macOS, Linux, Android (`.apk`), and iOS (`.ipa`)**.
- **⚡ Real-Time Progress & Speed Tracking**: Millisecond-accurate live progress bar, download speed (`MB/s`), downloaded file size counter, and dynamic Estimated Time of Arrival (ETA).
- **🎶 High-Fidelity Audio Extraction**: Built-in audio conversion supporting **MP3 (320 kbps High Quality)**, **Apple AAC (M4A)**, and **Lossless WAV**.
- **📁 Smart Playlist Downloader**: Automatically extracts full playlists and albums, creating dedicated folders inside your download directory to keep your media organized.
- **📑 Multi-Link Batch Queue**: Paste multiple URLs at once (one per line or comma-separated), automatically parse valid links, apply quality presets, and monitor batch progress with active counters.
- **🎬 Authentic Quality Selection**: Dynamically detects genuine stream resolutions (4K UHD, 2K QHD, 1080p FHD, 720p HD, 480p, 360p, or Best Available Auto) with container details and estimated file sizes.
- **🏷️ Clean Operating System Filename Sanitization**: Automatically preserves authentic media titles while removing reserved filesystem characters (`:`, `*`, `?`, `"`, `<`, `>`, `|`) and prevents accidental file overwriting.
- **📜 Local History & 1-Click File Explorer**: Stores download history with quick shortcuts to **"Open Containing Folder"** and **"Play File"**.
- **🎨 Modern Glassmorphic Dark UI**: Clean desktop and touch-friendly mobile design with ergonomic bottom navigation, glowing accents, and 4 curated themes (*Neon Midnight*, *OLED Pure Black*, *Cyberpunk Cyan*, and *Nordic Slate*).
- **🛡️ 100% Local & Privacy-Focused**: Runs entirely on your own device. No third-party proxy servers, zero telemetry, no user accounts, and no data tracking.

---

## 🌐 Supported Sources

Droply supports media extraction across hundreds of web platforms:

| Platform | Supported Media Types | Quality & Notes |
| :--- | :--- | :--- |
| **YouTube** | Videos, Shorts, Music & Playlists | Up to 4K UHD 60fps with automatic high-bitrate stream merging *(Desktop)* |
| **Instagram** | Reels, Stories, Posts & Carousels | Clean MP4 video clips & high-resolution images |
| **TikTok** | Video posts & Sound clips | High-definition video without platform watermarks |
| **Twitter / X** | Video tweets, clips & GIF loops | Best available MP4 bitrate streams |
| **Facebook** | Public watch videos & Reels | HD / SD MP4 streams |
| **Reddit** | Hosted video posts (v.redd.it) | Automatic video and audio track merging |
| **Bilibili** | Videos & animated episodes | High-resolution video streams |
| **Vimeo** | Public showcase & portfolio videos | Crisp adaptive MP4 streams |
| **SoundCloud** | Audio tracks & full albums | High-quality audio extraction with artwork |
| **Direct Links** | Direct `.mp4`, `.webm`, `.mp3`, `.wav` | Accelerated streaming chunk downloads |
| **1,000+ More** | Web media, podcasts, archives | Powered by the world-class media engine |

---

## 📋 Platform Compatibility & Requirements

Droply is designed to run locally on your hardware. Review the system requirements and platform-specific capabilities below:

| Platform | Package | Min OS Version | Architecture | System Requirements | Engine Capabilities & Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 🪟 **Windows** | `.zip` (Standalone) | Windows 10 (1809+) or 11 | x86_64 | Microsoft Edge WebView2, .NET 4.5+ | **Full Engine**: yt-dlp + bundled FFmpeg (4K stream merging, 320k audio, native taskbar icon) |
| 🍎 **macOS** | `.zip` (Standalone) | macOS 12.0+ (Sonoma tested) | Apple Silicon (`arm64`) | Built-in WebKit | **Full Engine**: yt-dlp + WebKit UI *(Unsigned binary: requires 1-time Gatekeeper approval)* |
| 🐧 **Linux** | `.tar.gz` (Standalone) | Ubuntu 22.04+, Debian 12+, Fedora 36+ | x86_64 | `glibc` ≥ 2.35, GTK 3 & WebKit2GTK *(or default browser)* | **Full Engine**: yt-dlp + bundled FFmpeg with automatic browser fallback |
| 🤖 **Android** | `.apk` (Standalone) | Android 7.0+ (API 24+) | `arm64-v8a`, `armeabi-v7a`, `x86_64` | Android System WebView | **Local Engine**: Embedded Python + yt-dlp. Downloads best progressive streams (up to 720p HD) and audio |
| 🍏 **iOS** | `.ipa` (Sideloadable) | iOS 15.0+ | `arm64` | Sideloading utility (AltStore, SideStore, TrollStore) | **Direct Stream Client**: High-speed downloads for direct video/audio URLs; saves to Photos & Files |

> [!NOTE]
> **Understanding Mobile Capabilities:**
> * **Desktop (Windows, macOS, Linux)** includes a bundled FFmpeg binary to merge separate ultra-high-definition video and audio streams (such as YouTube 1080p and 4K) into a single file.
> * **Android** runs the extractor engine directly on your phone and downloads the highest available progressive stream (with video and audio unified) to `Download/Droply` without needing external conversion tools.
> * **iOS** operates as a native direct-stream downloader saving straight to your Camera Roll and Files app. It handles direct media links natively without running local Python interpreters.

---

## 📦 Quick Start (Standalone Downloads)

Droply provides pre-compiled standalone releases for all platforms. **No Python or development tools are required.**

### 1. Download Droply v1.2.4

#### 💻 PC / Desktop
| Platform | Package | Verified Direct Link |
| :--- | :--- | :--- |
| 🪟 **Windows** (Recommended) | Standalone ZIP | [Download for Windows (x64)](https://github.com/Amlan-Sarkar/Droply/releases/download/v1.2.4/Droply-Windows-x64.zip) |
| 🍎 **macOS** | Apple Silicon ZIP | [Download for macOS (arm64)](https://github.com/Amlan-Sarkar/Droply/releases/download/v1.2.4/Droply-macOS.zip) |
| 🐧 **Linux** | x86_64 Archive | [Download for Linux (x86_64)](https://github.com/Amlan-Sarkar/Droply/releases/download/v1.2.4/Droply-Linux-x86_64.tar.gz) |

*Extract the archive and run directly. All dependencies are bundled.*

#### 📱 Phone / Mobile
| Platform | Package | Verified Direct Link |
| :--- | :--- | :--- |
| 🤖 **Android** | Standalone APK | [Download for Android (APK)](https://github.com/Amlan-Sarkar/Droply/releases/download/v1.2.4/Droply-Android.apk) |
| 🍏 **iOS** | Sideloadable IPA | [Download for iOS (IPA)](https://github.com/Amlan-Sarkar/Droply/releases/download/v1.2.4/Droply-iOS.ipa) |

*Runs directly on your phone and saves media to your storage and Photos library.*

---

### 2. Launch Instructions

* **Windows**:
  1. Extract `Droply-Windows-x64.zip`.
  2. Double-click **`Droply.exe`**.
  3. Droply launches immediately in a clean desktop window. *(If WebView2 is missing, it will automatically open in your default browser).*

* **macOS**:
  1. Extract `Droply-macOS.zip`.
  2. Because the app is distributed directly outside the Mac App Store, macOS Gatekeeper may show a security notice on first run.
  3. **Right-click** (or Control-click) the **`Droply`** executable and select **Open**, then click **Open** in the confirmation dialog. *(Alternatively, run `xattr -d com.apple.quarantine Droply` in Terminal).*

* **Linux**:
  1. Extract `Droply-Linux-x86_64.tar.gz`:
     ```bash
     tar -xzf Droply-Linux-x86_64.tar.gz
     ```
  2. Run the executable:
     ```bash
     ./Droply/Droply
     ```
  3. If GTK3 / WebKit2GTK is present, Droply opens in a dedicated window; otherwise, it opens seamlessly in your default web browser.

* **Android**:
  1. Download **`Droply-Android.apk`** to your phone.
  2. Tap the APK to install. When prompted, permit your browser or file manager to *"Install unknown apps"*.
  3. Open Droply from your app drawer.
  4. *Quick Share Tip*: You can share any video directly from the YouTube, Instagram, or Twitter app share menu to Droply for instant downloading!

* **iOS**:
  1. Download **`Droply-iOS.ipa`**.
  2. Sideload the IPA onto your iPhone or iPad using **AltStore**, **SideStore**, **TrollStore**, or **Sideloadly**.
  3. Launch Droply. Downloaded videos are saved directly to your Camera Roll (Photos) and audio files to the Files app.

---

## 🎯 How to Use

### 1. Single Media Downloader
1. **Copy Link**: Copy any video, reel, post, or audio link from your browser or social app.
2. **Paste**: Paste the URL into the search bar (or click the **Paste** button).
3. **Analyze**: Click **Analyze** (or press <kbd>Enter</kbd>) to preview title, uploader, thumbnail, and duration.
4. **Select Format**:
   * **Video Mode**: Choose your preferred quality (`Best Available`, `1080p`, `720p`, etc.).
   * **Audio Mode**: Switch to Audio mode to extract in `MP3 (320 kbps HQ)`, `M4A`, or `WAV`.
5. **Download**: Click **Download Media**. Watch live progress, download speed, and ETA.
6. **Open File**: Once finished, click **Open Containing Folder** to reveal your file or **Play File** to enjoy your media.

### 2. Playlists & Albums
* Paste a YouTube playlist, album, or series URL into the search bar.
* Droply detects playlist links and displays the total item count.
* When downloading, Droply automatically creates a **dedicated folder named after the playlist** inside your download directory so all items remain organized together.

### 3. Multi-Link Batch Queue
1. Navigate to the **Batch Downloader** tab.
2. Paste multiple links (one per line or separated by commas).
3. Click **Add URLs to Queue**.
4. Droply parses all valid URLs, enqueues them, and downloads them concurrently with live progress indicators.
5. Use **Clear Completed** anytime to reset finished tasks and refresh the queue counter.

### 4. Library & History
* Access the **Library & History** tab to view your past downloads.
* Open files directly, reveal their exact folder location, or clean up your download history with one click.

### 5. Personalization & Themes
* Open the **Settings** tab to choose between 4 themes:
  * 🌌 **Neon Midnight** (Default modern dark palette with indigo & violet accents)
  * 🖤 **OLED Pure Black** (Ultra-contrast black for AMOLED displays)
  * ⚡ **Cyberpunk Cyan** (High-energy cyan and neon accents)
  * 🏔️ **Nordic Slate** (Muted minimalist dark aesthetic)
* Configure your preferred default download path and quality presets.

---

## ⚖️ Legal Disclaimer & Fair Use Notice

Droply is an open-source utility designed exclusively for **personal archival, educational, and authorized fair-use purposes** (such as backing up content you created, accessing public-domain material, or saving media with explicit permission from the copyright owner).

Users are solely responsible for ensuring their downloads comply with all applicable local copyright laws and platform Terms of Service. Droply does not bypass DRM (Digital Rights Management), decrypt encrypted subscription streams, or circumvent private authentication walls.

---

## 📄 License & Community

Droply is licensed under the [MIT License](LICENSE).

* 🐛 **Issues & Feedback**: [Report an issue or suggest a feature](https://github.com/Amlan-Sarkar/Droply/issues)
* 🚀 **Releases & Updates**: [View all GitHub Releases](https://github.com/Amlan-Sarkar/Droply/releases)
