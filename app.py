"""
Droply - Universal Local Media Downloader
Application Entry Point and Desktop Window Launcher
"""

import os
import sys

# Priority import path for self-updated yt-dlp core engine
_engine_updates = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "Droply", "engine_updates")
if os.path.isdir(_engine_updates) and _engine_updates not in sys.path:
    sys.path.insert(0, _engine_updates)

# Safe stream redirection for PyInstaller --noconsole / --windowed mode on Windows
class SafeStream:
    def __init__(self, target_file=None):
        self.target_file = target_file

    def write(self, data):
        if self.target_file:
            try:
                self.target_file.write(str(data))
                self.target_file.flush()
            except Exception:
                pass

    def flush(self):
        if self.target_file:
            try:
                self.target_file.flush()
            except Exception:
                pass

    def isatty(self):
        return False


class MirrorStream:
    """Mirrors stream writes to both original output and log file."""
    def __init__(self, orig, log):
        self.orig = orig
        self.log = log

    def write(self, data):
        try:
            self.orig.write(data)
        except Exception:
            pass
        try:
            self.log.write(str(data))
            self.log.flush()
        except Exception:
            pass

    def flush(self):
        try:
            self.orig.flush()
        except Exception:
            pass
        try:
            self.log.flush()
        except Exception:
            pass

    def isatty(self):
        return getattr(self.orig, "isatty", lambda: False)()


_log_file = None
if sys.platform == "win32":
    try:
        log_dir = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "Droply")
        os.makedirs(log_dir, exist_ok=True)
        _log_file = open(os.path.join(log_dir, "droply.log"), "a", encoding="utf-8", errors="replace")
    except Exception:
        _log_file = None

if sys.stdout is None:
    sys.stdout = SafeStream(_log_file)
elif getattr(sys, "frozen", False) and _log_file:
    sys.stdout = MirrorStream(sys.stdout, _log_file)

if sys.stderr is None:
    sys.stderr = SafeStream(_log_file)
elif getattr(sys, "frozen", False) and _log_file:
    sys.stderr = MirrorStream(sys.stderr, _log_file)

import time
import socket
import threading
import webbrowser
import uvicorn

# On Windows, instantly hide any attached console window so no terminal appears
if sys.platform == "win32":
    try:
        import ctypes
        if "--console" not in sys.argv and "--debug" not in sys.argv:
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if hwnd:
                ctypes.windll.user32.ShowWindow(hwnd, 0)
    except Exception:
        pass

from server.api import app


def get_resource_path(relative_path: str) -> str:
    """Resolves path for development and PyInstaller bundled assets."""
    if getattr(sys, "frozen", False):
        base_dir = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    target = os.path.join(base_dir, relative_path)
    if os.path.exists(target):
        return target
    exe_dir_target = os.path.join(os.path.dirname(sys.executable), relative_path)
    if os.path.exists(exe_dir_target):
        return exe_dir_target
    return os.path.abspath(relative_path)


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0


def find_available_port(start_port: int = 8765) -> int:
    port = start_port
    while port < start_port + 50:
        if not is_port_in_use(port):
            return port
        port += 1
    return start_port


def run_server(host: str, port: int):
    """Runs Uvicorn server with safe logging configuration."""
    try:
        config = uvicorn.Config(
            app=app,
            host=host,
            port=port,
            log_level="warning",
            access_log=False,
            log_config=None  # Safe: do not override logging with raw console StreamHandlers
        )
        server = uvicorn.Server(config)
        server.run()
    except Exception as e:
        sys.stderr.write(f"DroplyServer exception: {e}\n")


try:
    import pyi_splash  # type: ignore
except ImportError:
    pyi_splash = None


def close_splash():
    """Safely dismisses the PyInstaller splash screen as soon as the interface is ready."""
    global pyi_splash
    if pyi_splash is not None:
        try:
            if hasattr(pyi_splash, "is_alive") and pyi_splash.is_alive():
                pyi_splash.close()
            elif hasattr(pyi_splash, "close"):
                pyi_splash.close()
        except Exception:
            pass
        pyi_splash = None


def main():
    parser = argparse.ArgumentParser(description="Droply - Universal Local Media Downloader")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port to run on (default: 8765)")
    parser.add_argument("--web", action="store_true", help="Launch in standard web browser instead of native window")
    parser.add_argument("--headless", action="store_true", help="Run server only without opening GUI or browser")
    args = parser.parse_args()

    port = args.port
    if is_port_in_use(port, args.host):
        port = find_available_port(port)

    app_url = f"http://{args.host}:{port}"
    print(f"==================================================")
    print(f"  Droply - Universal Local Media Engine")
    print(f"  Running at: {app_url}")
    print(f"==================================================")

    # Start FastAPI server in a background daemon thread
    server_thread = threading.Thread(
        target=run_server,
        args=(args.host, port),
        daemon=True,
        name="DroplyServer"
    )
    server_thread.start()

    # Launch non-essential background tasks in parallel without delaying the UI transition
    def _prewarm_background_tasks():
        try:
            from engine.providers.ytdlp_provider import get_yt_dlp
            get_yt_dlp()
        except Exception:
            pass

    threading.Thread(target=_prewarm_background_tasks, daemon=True, name="DroplyEnginePrewarm").start()

    # Wait for server to come online
    server_ready = False
    for _ in range(100):
        if not server_thread.is_alive():
            print("Fatal error: DroplyServer background thread terminated.")
            break
        if is_port_in_use(port, args.host):
            server_ready = True
            break
        time.sleep(0.04)

    if args.headless:
        close_splash()
        print("Server running in headless mode. Press Ctrl+C to stop.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down Droply.")
            sys.exit(0)

    if args.web:
        close_splash()
        print(f"Opening browser at: {app_url}")
        webbrowser.open(app_url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down Droply.")
            sys.exit(0)

    # Attempt native desktop window via pywebview
    try:
        import webview
        icon_path = get_resource_path("Droply.ico")
        if not os.path.exists(icon_path):
            icon_path = None

        print("Launching native Windows desktop application window...")
        # Create window hidden so no black/blank canvas flash appears while WebView2 warms up
        window = webview.create_window(
            title="Droply",
            url=app_url,
            width=1180,
            height=820,
            min_size=(920, 640),
            text_select=True,
            background_color='#0a0d14',
            hidden=True
        )

        window_revealed = False

        def reveal_window():
            nonlocal window_revealed
            if not window_revealed:
                window_revealed = True
                try:
                    window.show()
                except Exception:
                    pass
                close_splash()

        # Reveal the window as soon as the DOM & CSS are loaded
        window.events.loaded += lambda: reveal_window()

        # Resilient fallback timer: reveal window after 1.5s if loaded event is missed
        def _fallback_reveal():
            time.sleep(1.5)
            reveal_window()

        threading.Thread(target=_fallback_reveal, daemon=True, name="DroplyRevealFallback").start()

        def set_win32_window_icon():
            """Ensures the Droply icon is set on the Win32 window handle and taskbar."""
            if sys.platform == "win32" and icon_path and os.path.exists(icon_path):
                time.sleep(0.6)
                try:
                    import ctypes
                    user32 = ctypes.windll.user32
                    IMAGE_ICON = 1
                    LR_LOADFROMFILE = 0x00000010
                    LR_DEFAULTSIZE = 0x00000040
                    WM_SETICON = 0x0080
                    ICON_SMALL = 0
                    ICON_BIG = 1

                    h_icon = user32.LoadImageW(
                        None,
                        icon_path,
                        IMAGE_ICON,
                        0,
                        0,
                        LR_LOADFROMFILE | LR_DEFAULTSIZE
                    )
                    if h_icon:
                        hwnd = user32.FindWindowW(None, "Droply")
                        if hwnd:
                            user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, h_icon)
                            user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, h_icon)
                except Exception:
                    pass

        threading.Thread(target=set_win32_window_icon, daemon=True).start()

        def on_window_ready():
            """Called once the pywebview GUI thread is running."""
            close_splash()

        try:
            webview.start(on_window_ready, gui="edgechromium", icon=icon_path)
        except Exception:
            webview.start(on_window_ready, icon=icon_path)
        close_splash()
        print("Desktop application window closed.")
    except Exception as e:
        close_splash()
        print(f"Native window encountered: {e}. Falling back to default browser...")
        webbrowser.open(app_url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down Droply.")
            sys.exit(0)


if __name__ == "__main__":
    main()


