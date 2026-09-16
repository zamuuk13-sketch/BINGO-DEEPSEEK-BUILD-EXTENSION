from __future__ import annotations

import json
import threading
import time
import urllib.request
import urllib.error
from typing import Any, Callable

from .agent_runtime import AgentRuntime

BRIDGE = "http://127.0.0.1:8765"


class AutonomyEngine:
    """Bounded local execution loop for BINGO Stage 8.

    The engine never invents permissions: every privileged operation is routed
    through AgentRuntime before reaching the existing Python bridge.
    """

    MAX_STEPS = 100

    def __init__(self, runtime: AgentRuntime, permission_request: Callable[[str, str, str], bool] | None = None):
        self.runtime = runtime
        self.permission_request = permission_request
        self.active = False
        self.goal = ""
        self.steps = 0
        self.max_steps = 20
        self.last_result: dict[str, Any] | None = None
        self._lock = threading.Lock()

    def start(self, goal: str, max_steps: int = 20) -> dict[str, Any]:
        with self._lock:
            self.goal = str(goal or "").strip()
            self.max_steps = max(1, min(int(max_steps or 20), self.MAX_STEPS))
            self.steps = 0
            self.active = bool(self.goal)
            self.last_result = None
        if self.active:
            self.runtime.set_goal(self.goal)
            self.runtime.record("autonomy.start", {"goal": self.goal, "maxSteps": self.max_steps})
        return self.status()

    def stop(self, reason: str = "user") -> dict[str, Any]:
        self.active = False
        self.runtime.record("autonomy.stop", {"reason": reason, "steps": self.steps})
        return self.status()

    def status(self) -> dict[str, Any]:
        return {
            "active": self.active,
            "goal": self.goal,
            "steps": self.steps,
            "maxSteps": self.max_steps,
            "lastResult": self.last_result,
            "project": str(self.runtime.project) if self.runtime.project else None,
        }

    def execute(self, operation: str, arguments: dict[str, Any] | None = None, reason: str = "") -> dict[str, Any]:
        arguments = arguments or {}
        allowed, why = self.runtime.permission_for(operation)
        if not allowed:
            if self.permission_request:
                allowed = self.permission_request(operation, reason or why, json.dumps(arguments, ensure_ascii=False))
            if not allowed:
                result = {"ok": False, "blocked": True, "operation": operation, "error": why}
                self.runtime.record("tool.blocked", result)
                return result

        payload = {"id": f"desktop-auto-{time.time_ns()}", "op": operation, "project": str(self.runtime.project) if self.runtime.project else None, **arguments}
        try:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            request = urllib.request.Request(BRIDGE + "/tool", data=raw, method="POST", headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
            self.runtime.record("tool.result", {"operation": operation, "result": result})
            return result
        except (OSError, urllib.error.URLError, TimeoutError) as exc:
            result = {"ok": False, "operation": operation, "error": str(exc), "bridge": BRIDGE}
            self.runtime.record("tool.error", result)
            return result

    def step(self, operation: str | None = None, arguments: dict[str, Any] | None = None, reason: str = "") -> dict[str, Any]:
        if not self.active:
            return {"ok": False, "error": "Autonomia não está ativa.", **self.status()}
        if self.steps >= self.max_steps:
            self.active = False
            return {"ok": False, "error": "Limite de passos atingido.", **self.status()}
        self.steps += 1
        if not operation:
            result = {"ok": True, "kind": "awaiting_action", "message": "Runtime pronto para a próxima ação do agente."}
        else:
            result = self.execute(operation, arguments, reason)
        self.last_result = result
        self.runtime.record("autonomy.step", {"step": self.steps, "operation": operation, "result": result})
        return {"ok": True, "step": self.steps, "result": result, **self.status()}
