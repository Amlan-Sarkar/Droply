# Changelog

All notable changes to Droply will be documented in this file.

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
