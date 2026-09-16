from __future__ import annotations

import json
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Any


class ProductionManager:
    """Persistence, recovery, diagnostics and packaging helpers for Stage 10."""

    VERSION = 1
    APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "BingoClient"
    STATE_FILE = APP_DIR / "production-state.json"
    LOG_FILE = APP_DIR / "bingo-client.log"

    def __init__(self, runtime=None):
        self.runtime = runtime
        self.APP_DIR.mkdir(parents=True, exist_ok=True)
        self.state = self._load()

    def _load(self) -> dict[str, Any]:
        default = {"version": self.VERSION, "last_project": "", "last_session": "", "clean_shutdown": True, "updated": 0}
        try:
            if self.STATE_FILE.exists():
                data = json.loads(self.STATE_FILE.read_text(encoding="utf-8"))
                default.update(data)
        except (OSError, json.JSONDecodeError):
            pass
        return default

    def save(self, clean_shutdown: bool | None = None) -> None:
        if clean_shutdown is not None:
            self.state["clean_shutdown"] = clean_shutdown
        self.state["updated"] = time.time()
        self.STATE_FILE.write_text(json.dumps(self.state, indent=2, ensure_ascii=False), encoding="utf-8")

    def begin_session(self, project: Path | None, session_id: str = "") -> None:
        self.state["last_project"] = str(project.resolve()) if project else ""
        self.state["last_session"] = session_id
        self.save(clean_shutdown=False)
        self.log("session.start", {"project": self.state["last_project"], "session": session_id})

    def finish_session(self) -> None:
        self.save(clean_shutdown=True)
        self.log("session.clean_shutdown", {})

    def log(self, event: str, details: dict[str, Any] | None = None) -> None:
        payload = {"time": time.time(), "event": event, "details": details or {}}
        try:
            with self.LOG_FILE.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
        except OSError:
            pass

    def crash_recovery_needed(self) -> bool:
        return not bool(self.state.get("clean_shutdown", True))

    def diagnostics(self) -> dict[str, Any]:
        return {
            "version": self.VERSION,
            "python": sys.version,
            "executable": sys.executable,
            "platform": sys.platform,
            "appDir": str(self.APP_DIR),
            "stateFile": str(self.STATE_FILE),
            "logFile": str(self.LOG_FILE),
            "cleanShutdown": self.state.get("clean_shutdown", True),
            "project": self.state.get("last_project", ""),
        }

    @staticmethod
    def find_tool(name: str) -> str | None:
        return shutil.which(name)
