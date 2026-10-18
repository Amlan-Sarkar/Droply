# Changelog

All notable changes to Droply will be documented in this file.

## [1.4.1]

- **Android APK Build Pipeline Fix:** Resolved the Chaquopy build failure on Ubuntu CI runners by removing the rigid `buildPython "python3"` fallback that was executing Python 3.12 instead of the required Python 3.11 environment.
- **Persistent Release Keystore & In-Place Updates:** Configured a dedicated, persistent release signing keystore with both v1 (JAR) and v2 (Full APK Signature) schemes enabled. This ensures that every future release maintains signature continuity across builds, eliminating the "App not installed as package appears to be invalid" / update conflict error.
- **Dynamic Release Notes & Mirror Resiliency:** Updated release notes generator to dynamically inspect compiled assets, preventing broken 404 download links on releases if an artifact is missing. Updated README links accordingly.
- **Code Cleanliness & Warning Elimination:** Removed redundant `str()` calls in `server/api.py` version probing.

## [1.4.0]

- **Engine Version Normalization:** Resolved a cosmetic issue where the status indicator showed `Engine vinstalled` instead of the genuine yt-dlp core version. The engine now inspects package metadata, module version attributes, and `yt_dlp.version.__version__` for robust version resolution.
- **Bilibili Thumbnail Hotlink Proxy:** Fixed thumbnail loading for Bilibili links caused by CDN hotlinking restrictions (HTTP 403 Forbidden). Added `no-referrer` policies and a backend streaming proxy (`/api/proxy/thumbnail`) with Bilibili referer headers.
- **Opus & M4A Format Disambiguation:** Rewrote audio stream parsing to independently extract native AAC/M4A streams vs Opus/WebM streams, displaying true format-specific bitrates and download footprints (~128 kbps vs ~160 kbps) rather than identical sizes.
- **Transparent Audio Download UI:** The active download card and queue now display stream transfer metrics alongside expected encoded target sizes (e.g. `44.2 MB (Stream • Target ~105.6 MB)`) with a dedicated `Encoding MP3...` badge and status indicator during FFmpeg post-processing.
- **Splash Screen Overhaul & Flash Elimination:** Eliminated the multi-stage visual glitch on launch. Fixed the bright white WebView2 canvas flash by initializing windows with dark mode background brushes, dismissed external Tkinter splashes, and implemented a smooth in-app CSS shimmer warmup card.
- **Codebase Sanitization & Legacy Cleanup:** Purged redundant icon boilerplate files (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`), removed dead non-Windows platform branches, eliminated unused `aiofiles` dependency, added ProGuard configuration for Android, and unified all internal identifiers and thread naming to Droply.
- **Platform Scope Formalization:** Cleaned all legacy Apple/iOS webclip meta tags and non-Windows file helpers to strictly align Droply with Windows (Desktop) and Android (Mobile).

## [1.3.9]

- **Integrated Authentication & Cookie Manager:** Added full dual-mode authentication support to seamlessly bypass YouTube anti-bot verification challenges ("Sign in to confirm you're not a bot") and access member-only or restricted media.
- **Browser Profile Session Extraction:** Automatically probes and extracts session cookies directly from installed local browser profiles (Mozilla Firefox, Brave Browser, Vivaldi, Google Chrome, Microsoft Edge, Opera) to authenticate downloads without manual export.
- **Persistent & Portable `cookies.txt` Import:** Added native file browsing, direct in-app upload, and automatic path detection for Netscape `cookies.txt` files (safely stored locally in `~/.droply/cookies.txt` or `%LOCALAPPDATA%\Droply\cookies.txt`).
- **Granular Error Humanization & Typo Diagnostics:** Transformed raw yt-dlp error traces into clear, actionable advice. Anti-bot challenges, video typos / unavailable media (e.g. distinguishing digit '0' vs letter 'O' in video IDs), private videos, and DRM restrictions are now accurately distinguished with dedicated quick-action remediation buttons.
- **Regional Bans & VPN Advisory:** Added intelligent detection for country-level ISP blocks and geo-restrictions (e.g. TikTok, Reddit, or regional ISP filters) with actionable VPN connection guidance (Cloudflare WARP, ProtonVPN, Windscribe) in the UI, Settings, and documentation.
- **Media Card Authentication Status Badge:** The media preview card and engine diagnostics card now display live authentication status (e.g. `🍪 cookies.txt Active` or `🍪 FIREFOX Session Active`).

## [1.3.8]

- **Precise Video & Audio Filesize Estimations:** Calibrated format stream size parsing to prioritize exact network stream sizes reported by yt-dlp over synthetic approximations, factoring in codec efficiency (AV1 / VP9 / H.264) and audio stream overhead. Video size estimates now accurately match downloaded file sizes (e.g. 1080p estimated at ~122 MB vs actual 122 MB, instead of 423 MB).
- **Format-Specific Audio Size Calculations:** Audio download options now compute realistic converted file sizes on disk based on the chosen output codec and media duration. Lossless WAV estimates accurately reflect uncompressed 16-bit 44.1kHz stereo PCM (~500 MB for 50-minute audio vs actual 506 MB), MP3 estimates reflect 320 kbps CBR (~100 MB), and M4A/Opus reflect source audio streams (~44 MB) rather than displaying identical footprints across all formats.
- **Fixed Recent Downloads Blinking & Notification Toast Loop:** Resolved an issue where completed single downloads continuously triggered repetitive "Download completed successfully!" toast notifications and caused the recent downloads list to flicker every 1.5 seconds. Active task IDs are now properly cleared on completion or failure, and queue cards update in-place without rebuilding the DOM.
- **Fixed Library & History Blank Cards:** Resolved a frontend DOM collision where clearing the history list container inadvertently destroyed the empty-state element, causing subsequent history loads to fail with an unhandled null-reference exception. History cards and download summaries now render reliably.
- **Default Quality & Audio Format Settings Enforcement:** Saved user preferences for Default Video Quality (e.g. 4K UHD, 2K QHD, 1080p FHD) and Default Audio Format (e.g. WAV, M4A, MP3, Opus) are now actively respected and pre-selected whenever new media links are analyzed or when toggling between video and audio modes.

## [1.3.7]

- **WebSocket Broadcast Serialization & Live Progress Sync:** Fixed the WebSocket concurrency race condition caused by unsynchronized ASGI send calls across worker threads during yt-dlp download hooks. Download progress, speed, ETA, and completion states now stream live to the UI without freezing at 0.0% ("Starting...").
- **Resolved App Startup Reference Error:** Fixed an unhandled `ReferenceError: container is not defined` in `setupHistory()` that halted frontend initialization, which previously prevented the "Check for Updates" modal, WebSocket listeners, system status pill, and dynamic version detection from activating.
- **Fail-Safe Background Polling Fallback:** Added resilient background task polling every 1.5s during active downloads, ensuring download progress and status transitions reliably complete in the UI even across network changes, socket drops, or local firewall interventions.
- **Instant Cancel & Remove Action Responsiveness:** Queue item and active card "Cancel" and "Remove" (X) buttons now immediately update local UI state, dismiss the active progress card, and clear cancelled tasks from the queue list.
- **Version Alignment & Dynamic Header Badging:** Updated all static version indicators, modal fallbacks, and API version loaders to `v1.3.7`.
- **Intelligent yt-dlp Version Normalization:** Normalized PyPI version comparisons (e.g. `2026.08.19` vs `2026.8.19`) using numerical component tuples so up-to-date core engines are accurately reported.

## [1.3.6]

- **Multi-Quality Re-download Isolation:** Resolved the issue where downloading the same media at a higher/different resolution (e.g., 144p followed by 1080p FHD) completed in 1 second by reusing the previous lower-quality file. Droply now enforces unique target filenames and enables download execution so distinct qualities download to disk independently without collisions.
- **Auto-Dismissal of Failed Download Error Cards:** The "Download unavailable" error card is now automatically dismissed whenever a retry is triggered, when a task transitions to downloading, or when a download finishes.
- **Resilient Open File & Multi-Level Path Resolution:** Escaped and sanitized all HTML attributes for media titles containing quotes or special characters. Added task ID and download folder fallback resolution to ensure "Open" and "Play" buttons in Recent Downloads and History reliably launch the file.
- **Reliable Library & History Rendering:** Added fault-tolerant item rendering in the History & Library tab, safeguarding against non-string format labels and unescaped thumbnail error handlers so every finished download renders cleanly in the list.
- **Transient Handshake & 403 Auto-Retry:** Added automatic retry guards in media metadata extraction and API fetch requests to eliminate transient "source server rejected the request" and connection warnings on initial interaction.
- **Streamlined Completion Interface:** Removed the redundant "Download Another" action button from the download completion card.

## [1.3.5]

- **Accurate Media Size Estimations:** Implemented realistic bitrate caps for high-framerate, VP9, and AV1 video streams (preventing inflated 24+ Mbps estimations) and calibrated audio calculations so format chips display genuine, realistic sizes.
- **Audio-Only Stream Network Footprints:** Audio-only format chips and cards now display genuine download payload sizes (e.g., ~15 MB for full-length high-bitrate audio) and clean descriptive labels rather than video-sized footprint estimates.
- **Socket Timeouts & Anti-Freeze Protections:** Added strict socket timeouts (`15s`), fragment retry loops, and network stall guards in yt-dlp to prevent downloads from hanging indefinitely during network interruptions.
- **Incomplete Stream Merge Prevention & Auto-Cleanup:** Incomplete video streams are never merged with finished audio streams if a connection drops. Temporary and partial files (`.part`, `.temp`) are now automatically purged on cancellation, retry, or failure.
- **Distinct Cancelled vs Failed States:** Updated the download queue interface to visually separate user-cancelled downloads (soft amber) from network or extraction failures (soft red).
- **Unicode Path Resolution for File Actions:** Added normalization for special Unicode punctuation (smart apostrophes, curly quotes) in media titles. "Open File" and "Reveal in Folder" reliably target the exact downloaded file without falling back to the application folder.
- **Synchronized History & Library Metrics:** Excluded failed or cancelled 0-byte ghost entries from the history log and download statistics, ensuring accurate item counts and library disk usage totals.

## [1.3.4]

- **Full Resolution Stream Extraction (Up to 4K / 2160p):** Removed restrictive client overrides that limited media streams to 360p. Droply now detects and offers all available resolutions (4K 2160p, 1440p, 1080p FHD, 720p HD, 480p, 360p, 240p) with seamless fallback so audio merging never caps video resolution.
- **True Audio-Only Downloads & Accurate Size Estimations:** Audio downloads now fetch genuine audio-only streams directly (saving over 100+ MB of network bandwidth per download) rather than downloading entire video streams. Format chips and download cards display accurate estimated sizes and bitrates.
- **Permanent Idle Sleeping Cat & Welcome Cue:** Preserved the sleeping cat artwork and "Ready for media" welcome prompt in static HTML and queue management so it never disappears during sessions, on launch, or after clearing downloads.
- **Refined Windows Desktop Controls:** Removed the mobile-specific "Download to Phone" label in favor of clean desktop action controls ("Download") tailored for Windows.
- **Target Quality Presets for Batch Downloads:** Enforced clean preset identifiers (4K UHD, Full HD 1080p, HD 720p, Best Auto, and Audio Only) that guarantee batch downloads respect the chosen resolution cap and automatically adapt to each link's maximum available quality.

## [1.3.3]

- **Native OS Clipboard Paste:** Direct desktop clipboard reading with zero browser permission popups and no manual prompt dialogs.
- **Intelligent Core Engine Status:** Clear detection of whether the embedded yt-dlp core is already up to date, eliminating misleading duplicate update messages.
- **Accurate Download Progress:** Progress meter displays matching totals upon completion with zero-byte fallback fixes.
- **Seamless Setup & Launch:** Added missing runtime threading imports to ensure smooth installation and startup.

## [1.3.2]

- **Runtime Import Resolution:** Added top-level threading and system imports preventing startup script exceptions.
- **Completion Progress Display:** Synchronized download byte counter to match total archive size on completion.

## [1.3.1]

- **Thread-Safe Download Manager:** Implemented cancellation tokens and generation counters to eliminate race conditions and looping downloads.
- **Installer Verification:** Added tempfile verification for clean Windows setup execution.

## [1.3.0]

- **Refined Cat-Inspired Design:** Minimalist feline outline divider, sleeping kitten idle state in the downloader queue, and cleaned-up UI hints.
- **Theme-Adaptive Interface:** Analyze button, update controls, and security badges automatically harmonize with your active color theme.
- **Live Services Monitor:** Animated breathing pulse indicator displays real-time local background engine connectivity and status.
- **Private by Design:** 100% on-device local processing with zero telemetry, zero analytics, and no external tracking.
- **Core Engine Stability:** Embedded yt-dlp core engine update system with dynamic version detection and seamless restart installer.
