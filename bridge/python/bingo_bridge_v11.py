"""BINGO V11 production runtime.
Adds durable autonomy checkpoints, resumable sessions, run ledger and final health on top of V10.
"""
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

import bingo_bridge_v10 as base

V11_VERSION = 1
MAX_LEDGER = 500
MAX_CHECKPOINTS = 50
lock = threading.Lock()
runtime = {}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def runtime_dir(project):
    project = base.base.base.project_name(project)
    path = base.base.base.project_dir(project) / ".bingo"
    path.mkdir(parents=True, exist_ok=True)
    return path


def state_path(project):
    return runtime_dir(project) / "v11-runtime.json"


def load(project):
    project = base.base.base.project_name(project)
    if project in runtime:
        return runtime[project]
    data = {"version": V11_VERSION, "project": project, "session": None, "ledger": [], "checkpoints": []}
    path = state_path(project)
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data.update(loaded)
        except Exception:
            pass
    runtime[project] = data
    return data


def save(project, data):
    project = base.base.base.project_name(project)
    data["version"] = V11_VERSION
    data["updatedAt"] = now_iso()
    state_path(project).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    runtime[project] = data


def ledger(project, event, payload=None):
    with lock:
        data = load(project)
        data.setdefault("ledger", []).append({"at": now_iso(), "event": str(event), "payload": payload or {}})
        data["ledger"] = data["ledger"][-MAX_LEDGER:]
        save(project, data)
        return data["ledger"][-1]


def checkpoint(project, label="checkpoint"):
    project = base.base.base.project_name(project)
    snap = base.snapshot(project)
    with lock:
        data = load(project)
        item = {"id": f"cp-{int(datetime.now().timestamp()*1000)}", "label": str(label)[:200], "createdAt": now_iso(), "snapshot": snap}
        data.setdefault("checkpoints", []).append(item)
        data["checkpoints"] = data["checkpoints"][-MAX_CHECKPOINTS:]
        save(project, data)
        return item


def autonomy_start(project, goal="", max_steps=20, resume=True):
    project = base.base.base.project_name(project)
    data = load(project)
    previous = data.get("session") if resume else None
    if previous and previous.get("active") and previous.get("goal") == str(goal or ""):
        return previous
    result = base.autonomy_start(project, goal, max_steps)
    result["resumeSupported"] = True
    result["sessionId"] = f"auto-{int(datetime.now().timestamp()*1000)}"
    with lock:
        data["session"] = result
        save(project, data)
    ledger(project, "autonomy.start", {"sessionId": result["sessionId"], "goal": result["goal"]})
    checkpoint(project, "session-start")
    return result


def autonomy_step(project, action=None):
    project = base.base.base.project_name(project)
    result = base.autonomy_step(project, action)
    with lock:
        data = load(project)
        if data.get("session"):
            data["session"].update(result)
            data["session"]["lastActionAt"] = now_iso()
        save(project, data)
    ledger(project, "autonomy.step", {"step": result["steps"], "action": str(action or "")[:1000]})
    if result["steps"] % 5 == 0:
        checkpoint(project, f"step-{result['steps']}")
    return result


def autonomy_stop(project):
    project = base.base.base.project_name(project)
    result = base.autonomy_stop(project)
    with lock:
        data = load(project)
        if data.get("session"):
            data["session"].update(result)
            data["session"]["stoppedAt"] = now_iso()
        save(project, data)
    ledger(project, "autonomy.stop", {"steps": result.get("steps", 0)})
    checkpoint(project, "session-stop")
    return result


def runtime_status(project):
    project = base.base.base.project_name(project)
    data = load(project)
    return {"version": V11_VERSION, "project": project, "session": data.get("session"), "ledgerSize": len(data.get("ledger", [])), "checkpointCount": len(data.get("checkpoints", [])), "latestCheckpoint": data.get("checkpoints", [])[-1] if data.get("checkpoints") else None}


def ledger_read(project, limit=50):
    data = load(project)
    return {"project": data["project"], "events": data.get("ledger", [])[-min(max(int(limit or 50), 1), MAX_LEDGER):]}


def checkpoint_list(project, limit=10):
    data = load(project)
    return {"project": data["project"], "checkpoints": data.get("checkpoints", [])[-min(max(int(limit or 10), 1), MAX_CHECKPOINTS):]}


def resume(project):
    project = base.base.base.project_name(project)
    data = load(project)
    item = data.get("session")
    if not item:
        return {"resumed": False, "reason": "Nenhuma sessao persistida."}
    if item.get("active"):
        return {"resumed": True, "session": item}
    return {"resumed": False, "reason": "A ultima sessao esta parada.", "session": item}


def health(project=None):
    result = {"version": V11_VERSION, "status": "ok", "runtime": "production", "timestamp": now_iso()}
    if project:
        result["project"] = runtime_status(project)
    return result


_original_execute = base.execute

def execute(req):
    op = req.get("op")
    project = req.get("project")
    if op == "agent.runtime.status": return runtime_status(project)
    if op == "agent.ledger.read": return ledger_read(project, req.get("limit", 50))
    if op == "agent.checkpoint.create": return checkpoint(project, req.get("label", "checkpoint"))
    if op == "agent.checkpoint.list": return checkpoint_list(project, req.get("limit", 10))
    if op == "agent.session.resume": return resume(project)
    if op == "agent.health": return health(project)
    if op == "agent.autonomy.start": return autonomy_start(project, req.get("goal", ""), req.get("maxSteps", 20), req.get("resume", True))
    if op == "agent.autonomy.step": return autonomy_step(project, req.get("action", ""))
    if op == "agent.autonomy.stop": return autonomy_stop(project)
    return _original_execute(req)

base.execute = execute

if __name__ == "__main__":
    print(f"BINGO Python Bridge V11 ativo em http://{base.base.base.HOST}:{base.base.base.PORT}")
    print(f"Workspace: {base.base.base.ROOT}")
    base.base.base.ThreadingHTTPServer((base.base.base.HOST, base.base.base.PORT), base.base.base.Handler).serve_forever()
