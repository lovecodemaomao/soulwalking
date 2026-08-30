"""Windows desktop entry point for the distributable SoulWalking app."""

from __future__ import annotations

import socket
import threading
import time
import webbrowser
import tkinter as tk
from tkinter import ttk

import uvicorn

from app.main import app

BIND_HOST = "0.0.0.0"
CHECK_HOST = "127.0.0.1"
PORT = 8000
URL = f"http://{CHECK_HOST}:{PORT}/"


def _service_ready() -> bool:
    try:
        with socket.create_connection((CHECK_HOST, PORT), timeout=0.25):
            return True
    except OSError:
        return False


class DesktopLauncher:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("SoulWalking 城格漫游智能体")
        self.root.geometry("430x210")
        self.root.resizable(False, False)
        self.server: uvicorn.Server | None = None
        self._browser_opened = False

        frame = ttk.Frame(self.root, padding=28)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="SoulWalking 城格漫游智能体", font=("Microsoft YaHei", 16, "bold")).pack(anchor="w")
        ttk.Label(frame, text="本地体验服务", font=("Microsoft YaHei", 10)).pack(anchor="w", pady=(4, 16))
        self.status = ttk.Label(frame, text="正在启动服务与加载本地模型…", font=("Microsoft YaHei", 10))
        self.status.pack(anchor="w", pady=(0, 18))

        buttons = ttk.Frame(frame)
        buttons.pack(anchor="e", fill="x")
        ttk.Button(buttons, text="打开网页", command=self.open_browser).pack(side="left")
        ttk.Button(buttons, text="退出", command=self.close).pack(side="right")
        self.root.protocol("WM_DELETE_WINDOW", self.close)

    def open_browser(self) -> None:
        webbrowser.open_new_tab(URL)
        self._browser_opened = True

    def _set_status(self, message: str) -> None:
        self.status.configure(text=message)

    def _run_server(self) -> None:
        try:
            config = uvicorn.Config(app, host=BIND_HOST, port=PORT, log_level="warning")
            self.server = uvicorn.Server(config)
            self.server.run()
        except Exception as error:  # pragma: no cover - UI-only fallback
            self.root.after(0, self._set_status, f"启动失败：{type(error).__name__}")

    def _wait_for_service(self) -> None:
        for _ in range(120):
            if _service_ready():
                self.root.after(0, self._set_status, "服务已启动，浏览器正在打开。")
                if not self._browser_opened:
                    self.root.after(0, self.open_browser)
                return
            time.sleep(0.25)
        self.root.after(0, self._set_status, "服务启动超时，请检查同目录 data 文件夹。")

    def start(self) -> None:
        if _service_ready():
            self._set_status("检测到服务已在运行，正在打开浏览器。")
            self.open_browser()
        else:
            threading.Thread(target=self._run_server, daemon=True).start()
            threading.Thread(target=self._wait_for_service, daemon=True).start()
        self.root.mainloop()

    def close(self) -> None:
        if self.server is not None:
            self.server.should_exit = True
        self.root.destroy()


if __name__ == "__main__":
    DesktopLauncher().start()
