from __future__ import annotations

import json
import os
import platform
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


class AgentRuntime:
    """Local orchestration layer with persistent memory and permission gates."""

    VERSION = 2
    MEMORY_FILE = ".bingo-agent.json"

    def __init__(self, project: Path | None, config: dict[str, Any] | None = None, permission_request: Callable[[str, str, str], bool] | None = None):
        self.project = project.resolve() if project else None
        self.config = config or {}
        self.permission_request = permission_request
        self.session_id = f"desktop-{uuid.uuid4().hex[:12]}"
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.memory: dict[str, Any] = self._load_memory()
        self.plan = self.memory.setdefault("plan", {"goal": "", "tasks": [], "current": None})
        self.events = self.memory.setdefault("events", [])[-100:]

    @property
    def permissions(self) -> dict[str, Any]:
        return self.config.setdefault("permissions", {})

    def _memory_path(self) -> Path | None:
        return self.project / self.MEMORY_FILE if self.project else None

    def _load_memory(self) -> dict[str, Any]:
        path = self._memory_path()
        default = {"version": self.VERSION, "sessions": [], "plan": {"goal": "", "tasks": [], "current": None}, "events": []}
        if not path or not path.exists():
            return default
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else default
        except (OSError, json.JSONDecodeError):
            return default

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
        root = self.project
        return {
            "runtime": {"name": "BINGO Agent Runtime", "version": self.VERSION, "sessionId": self.session_id},
            "workspace": {"selected": bool(root), "path": str(root) if root else None, "safeScope": "selected-project" if root else "none"},
            "environment": {"os": platform.platform(), "python": platform.python_version(), "machine": platform.machine(), "cwd": os.getcwd()},
            "capabilities": {
                "filesystem": bool(root),
                "terminal": self.permissions.get("terminal", False),
                "internet": self.permissions.get("internet", "approval"),
                "installations": self.permissions.get("installations", "approval"),
                "computer": self.permissions.get("computer", False),
            },
            "plan": self.plan,
        }

    def permission_for(self, operation: str, reason: str = "", details: str = "") -> tuple[bool, str]:
        op = str(operation or "")
        if op.startswith("fs.") or op.startswith("project."):
            return (bool(self.project), "workspace" if self.project else "Abra um projeto primeiro.")

        category = None
        if op.startswith("process."): category = "terminal"
        elif op.startswith("internet."): category = "internet"
        elif op.startswith("install."): category = "installations"
        elif op.startswith("computer."): category = "computer"
        if not category:
            return True, "agent"

        value = self.permissions.get(category, "approval")
        if value is True or value == "allow":
            return True, category
        if value is False or value == "deny":
            return False, f"Permissão de {category} negada."
        if self.permission_request:
            allowed = bool(self.permission_request(op, reason or f"O agente precisa de acesso a {category}.", details))
            return allowed, "approved" if allowed else f"Permissão de {category} negada pelo usuário."
        return False, f"Permissão de {category} requer aprovação."

    def tool_request(self, operation: str, arguments: dict[str, Any] | None = None, reason: str = "", details: str = "") -> dict[str, Any]:
        allowed, reason_out = self.permission_for(operation, reason, details)
        result = {"allowed": allowed, "operation": operation, "reason": reason_out, "arguments": arguments or {}}
        self.record("tool.request", result)
        return result

    def system_summary(self) -> str:
        return json.dumps(self.context(), ensure_ascii=False, separators=(",", ":"))

    def status(self) -> dict[str, Any]:
        return {"version": self.VERSION, "sessionId": self.session_id, "project": str(self.project) if self.project else None, "goal": self.plan.get("goal", ""), "tasks": len(self.plan.get("tasks", [])), "events": len(self.events), "capabilities": self.context()["capabilities"]}

    def reset_session(self) -> None:
        self.session_id = f"desktop-{uuid.uuid4().hex[:12]}"
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.record("session.reset", {"sessionId": self.session_id})
