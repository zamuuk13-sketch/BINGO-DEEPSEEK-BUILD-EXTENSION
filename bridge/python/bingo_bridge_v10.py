"""BINGO V10 autonomy/orchestration extension.
Adds bounded multi-tool execution and autonomous session state on top of V9.
"""
import threading
from datetime import datetime, timezone

import bingo_bridge_v9 as base

V10_VERSION = 1
MAX_BATCH = 25
MAX_AUTONOMY_STEPS = 100
state_lock = threading.Lock()
autonomy = {}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def session(project):
    project = base.base.project_name(project)
    with state_lock:
        return autonomy.setdefault(project, {
            "project": project,
            "active": False,
            "goal": "",
            "steps": 0,
            "maxSteps": 20,
            "startedAt": None,
            "lastAction": None,
            "lastError": None,
        })


def autonomy_start(project, goal="", max_steps=20):
    item = session(project)
    with state_lock:
        item.update({"active": True, "goal": str(goal or "")[:5000], "steps": 0,
                     "maxSteps": min(max(int(max_steps or 20), 1), MAX_AUTONOMY_STEPS),
                     "startedAt": now_iso(), "lastAction": None, "lastError": None})
        return dict(item)


def autonomy_stop(project):
    item = session(project)
    with state_lock:
        item["active"] = False
        return dict(item)


def autonomy_status(project):
    return dict(session(project))


def autonomy_step(project, action=None):
    item = session(project)
    with state_lock:
        if not item["active"]:
            raise ValueError("Autonomia nao esta ativa")
        if item["steps"] >= item["maxSteps"]:
            item["active"] = False
            raise ValueError("Limite de passos da sessao autonoma atingido")
        item["steps"] += 1
        item["lastAction"] = str(action or "")[:1000]
        return dict(item)


def batch(project, operations):
    if not isinstance(operations, list) or not operations:
        raise ValueError("agent.batch exige uma lista de operacoes")
    if len(operations) > MAX_BATCH:
        raise ValueError(f"agent.batch aceita no maximo {MAX_BATCH} operacoes")
    results = []
    for index, operation in enumerate(operations):
        if not isinstance(operation, dict):
            results.append({"index": index, "ok": False, "error": "Operacao invalida"})
            continue
        op = str(operation.get("op") or "").strip()
        req = dict(operation)
        req["op"] = op
        req.setdefault("project", project)
        try:
            value = base.base.execute(req)
            results.append({"index": index, "op": op, "ok": True, "result": value})
        except Exception as exc:
            results.append({"index": index, "op": op, "ok": False, "error": str(exc)})
            break
    return {"project": base.base.project_name(project), "count": len(results), "stoppedOnError": any(not x["ok"] for x in results), "results": results}


_original_execute = base.execute


def execute(req):
    op = req.get("op")
    project = req.get("project")
    if op == "agent.autonomy.start":
        return autonomy_start(project, req.get("goal", ""), req.get("maxSteps", 20))
    if op == "agent.autonomy.stop":
        return autonomy_stop(project)
    if op == "agent.autonomy.status":
        return autonomy_status(project)
    if op == "agent.autonomy.step":
        return autonomy_step(project, req.get("action", ""))
    if op == "agent.batch":
        return batch(project, req.get("operations", []))
    return _original_execute(req)


base.execute = execute

if __name__ == "__main__":
    print(f"BINGO Python Bridge V10 ativo em http://{base.base.HOST}:{base.base.PORT}")
    print(f"Workspace: {base.base.ROOT}")
    base.base.ThreadingHTTPServer((base.base.HOST, base.base.PORT), base.base.Handler).serve_forever()
