from __future__ import annotations

import tkinter as tk

from .chat import DeepSeekChat
from .deepseek import start_server
from .main import BingoClient


class BingoClientV5(BingoClient):
    """Stage 5 shell: preserves the IDE and adds the desktop DeepSeek session."""

    def __init__(self):
        self.deepseek_server = start_server()
        self.deepseek_window = None
        super().__init__()
        self.bind_all("<Control-Shift-d>", lambda _e: self.open_deepseek() or "break")
        self.after(350, self.open_deepseek)

    def open_deepseek(self):
        if self.deepseek_window and self.deepseek_window.winfo_exists():
            self.deepseek_window.lift()
            self.deepseek_window.focus_force()
            return
        project_name = self.project_path.name if self.project_path else "DeepSeek"
        self.deepseek_window = DeepSeekChat(self, project_name=project_name)

    def on_close(self):
        try:
            if self.deepseek_window and self.deepseek_window.winfo_exists():
                self.deepseek_window.close()
        finally:
            super().on_close()


def main():
    BingoClientV5().mainloop()


if __name__ == "__main__":
    main()
