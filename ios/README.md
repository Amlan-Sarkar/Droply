# iOS Platform Support (Deprecated)

Droply officially targets **Windows (10/11 x64)** and **Android (7.0+)** platforms.

iOS support is not maintained or supported because iOS does not permit native background python runtimes or custom yt-dlp core execution. All development and release workflows are focused exclusively on:
1. Windows: Native Python + PyWebView + Inno Setup installer
2. Android: Java WebView + Chaquopy Python + yt-dlp engine + Android Intent media playback
