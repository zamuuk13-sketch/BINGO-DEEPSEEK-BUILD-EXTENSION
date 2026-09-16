from __future__ import annotations

import json
import os
import platform
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .workspace import Workspace


class AgentRuntime:
    """Local orchestration layer for BINGO Client Stage 6.

    It owns session context, memory, plan state and capability/permission checks.
    Actual filesystem/process execution remains delegated to the existing BINGO
    Python bridge, so the desktop client does not duplicate the V11 sandbox.
    """

    VERSION = 1
    MEMORY_FILE = ".bingo-agent.json"

    def __init__(self, project: Path | None, config: dict[str, Any] | None = None):
        self.project = project.resolve() if project else None
        self.config = config or {}
        self.session_id = f"desktop-{uuid.uuid4().hex[:12]}"
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.memory: dict[str, Any] = self._load_memory()
        self.plan: dict[str, Any] = self.memory.setdefault("plan", {"goal": "", "tasks": [], "current": None})
        self.events: list[dict[str, Any]] = self.memory.setdefault("events", [])[-100:]

    @property
    def permissions(self) -> dict[str, Any]:
        return self.config.get("permissions", {})

    def _memory_path(self) -> Path | None:
        if not self.project:
            return None
        return self.project / self.MEMORY_FILE

    def _load_memory(self) -> dict[str, Any]:
        path = self._memory_path()
        if not path or not path.exists():
            return {"version": self.VERSION, "sessions": [], "plan": {"goal": "", "tasks": [], "current": None}, "events": []}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {"version": self.VERSION, "sessions": [], "plan": {"goal": "", "tasks": [], "current": None}, "events": []}

    def save(self) -> None:
        path = self._memory_path()
        if not path:
            return
        self.memory["version"] = self.VERSION
        self.memory["updatedAt"] = datetime.now(timezone.utc).isoformat()
        self.memory["sessions"] = (self.memory.get("sessions", []) + [{"id": self.session_id, "startedAt": self.started_at}])[-20:]
        self.memory["events"] = self.events[-100:]
        try:
            path.write_text(json.dumps(self.memory, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            pass

    def record(self, event: str, payload: Any = None) -> None:
        self.events.append({"at": datetime.now(timezone.utc).isoformat(), "event": event, "payload": payload})
        self.events = self.events[-100:]
        self.save()

    def set_goal(self, goal: str) -> None:
        self.plan["goal"] = str(goal).strip()
        self.record("plan.goal", self.plan["goal"])

    def add_task(self, task: str) -> None:
        self.plan.setdefault("tasks", []).append({"title": str(task), "status": "pending"})
        self.record("plan.task.add", task)

    def context(self) -> dict[str, Any]:
        """Build internal context. This object is never displayed in the chat UI."""
        root = self.project
        return {
            "runtime": {"name": "BINGO Agent Runtime", "version": self.VERSION, "sessionId": self.session_id},
            "workspace": {
                "selected": bool(root),
                "path": str(root) if root else None,
                "safeScope": "selected-project" if root else "none",
            },
            "environment": {
                "os": platform.platform(),
                "python": platform.python_version(),
                "machine": platform.machine(),
                "cwd": os.getcwd(),
            },
            "capabilities": {
                "filesystem": bool(root),
                "terminal": bool(self.permissions.get("terminal", False)),
                "internet": self.permissions.get("internet", "approval"),
                "installations": self.permissions.get("installations", "approval"),
                "computer": bool(self.permissions.get("computer", False)),
            },
            "plan": self.plan,
        }

    def permission_for(self, operation: str) -> tuple[bool, str]:
        op = str(operation or "")
        if op.startswith("fs.") or op.startswith("project."):
            if not self.project:
                return False, "Abra um projeto antes de usar ferramentas de workspace."
            return True, "workspace"
        if op.startswith("process."):
            if self.permissions.get("terminal", False):
                return True, "terminal"
            return False, "Permissão de terminal desativada."
        if op.startswith("internet."):
            value = self.permissions.get("internet", "approval")
            return (value == "allow"), "internet approval required" if value != "allow" else "internet"
        if op.startswith("install."):
            value = self.permissions.get("installations", "approval")
            return (value == "allow"), "installation approval required" if value != "allow" else "installation"
        if op.startswith("computer."):
            return (bool(self.permissions.get("computer", False)), "computer permission required")
        return True, "agent"

    def tool_request(self, operation: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        allowed, reason = self.permission_for(operation)
        result = {"allowed": allowed, "operation": operation, "reason": reason, "arguments": arguments or {}}
        self.record("tool.request", result)
        return result

    def system_summary(self) -> str:
        """Compact internal briefing used by the transport layer."""
        ctx = self.context()
        return json.dumps(ctx, ensure_ascii=False, separators=(",", ":"))

    def status(self) -> dict[str, Any]:
        return {
            "version": self.VERSION,
            "sessionId": self.session_id,
            "project": str(self.project) if self.project else None,
            "goal": self.plan.get("goal", ""),
            "tasks": len(self.plan.get("tasks", [])),
            "events": len(self.events),
            "capabilities": self.context()["capabilities"],
        }

    def reset_session(self) -> None:
        self.session_id = f"desktop-{uuid.uuid4().hex[:12]}"
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.record("session.reset", {"sessionId": self.session_id})
