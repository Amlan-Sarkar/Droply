"""
Droply - Universal Local Media Downloader
Application Entry Point and Desktop Window Launcher
"""

import os
import sys


import time
import socket
import argparse
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
    """Runs Uvicorn server."""
    config = uvicorn.Config(
        app=app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False
    )
    server = uvicorn.Server(config)
    server.run()


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

    # Wait for server to come online
    for _ in range(30):
        if is_port_in_use(port, args.host):
            break
        time.sleep(0.1)

    if args.headless:
        print("Server running in headless mode. Press Ctrl+C to stop.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down Droply.")
            sys.exit(0)

    if args.web:
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
        window = webview.create_window(
            title="Droply",
            url=app_url,
            width=1180,
            height=820,
            min_size=(920, 640),
            text_select=True,
        )

        def set_win32_window_icon():
            """Ensures the Droply icon is set on the Win32 window handle and taskbar."""
            if sys.platform == "win32" and icon_path and os.path.exists(icon_path):
                time.sleep(1.2)
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

        try:
            webview.start(gui="edgechromium", icon=icon_path)
        except Exception:
            webview.start(icon=icon_path)
        print("Desktop application window closed.")
    except Exception as e:
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


