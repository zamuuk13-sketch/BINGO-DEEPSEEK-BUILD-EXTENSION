import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = int(os.environ.get("BINGO_PORT", "8765"))
ROOT = Path(os.environ.get("BINGO_WORKSPACE", Path.home() / "BingoProjects")).resolve()
ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_EXECUTABLES = {
    "godot", "godot.exe", "node", "node.exe", "python", "python.exe",
    "py", "npm", "npm.cmd", "npx", "npx.cmd", "gcc", "g++", "cmake",
    "cargo", "rustc"
}

MEMORY_FILE = "bingo-agent.json"
MEMORY_VERSION = 2
MAX_HISTORY = 120
MAX_TESTS = 50
MAX_TEXT = 5000
MAX_PLAN_TASKS = 200


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def project_name(value):
    value = str(value or "").strip()
    clean = "".join(c if c.isalnum() or c in " ._-" else "_" for c in value)
    if not clean or clean in {".", ".."}:
        raise ValueError("Nome de projeto invalido")
    return clean


def project_dir(project):
    return (ROOT / project_name(project)).resolve()


def safe_path(project, relative=""):
    base = project_dir(project)
    target = (base / str(relative or "").replace("\\", "/")).resolve()
    if target != base and base not in target.parents:
        raise ValueError("Caminho fora do projeto bloqueado")
    return base, target


def default_plan():
    return {"goal": "", "status": "idle", "tasks": [], "currentTaskId": None}


def default_memory(project):
    return {
        "version": MEMORY_VERSION,
        "project": project_name(project),
        "updatedAt": now_iso(),
        "context": "",
        "completedTasks": [],
        "pendingTasks": [],
        "knownErrors": [],
        "tests": [],
        "history": [],
        "plan": default_plan()
    }


def memory_path(project):
    _, target = safe_path(project, MEMORY_FILE)
    return target


def normalize_plan(value):
    plan = default_plan()
    if isinstance(value, dict):
        plan.update({k: value[k] for k in plan if k in value})
    if not isinstance(plan.get("tasks"), list):
        plan["tasks"] = []
    normalized = []
    for i, raw in enumerate(plan["tasks"][:MAX_PLAN_TASKS]):
        if not isinstance(raw, dict):
            continue
        task = dict(raw)
        task["id"] = str(task.get("id") or f"task-{i+1}")
        task["title"] = str(task.get("title") or "Tarefa sem titulo")[:500]
        task["status"] = str(task.get("status") or "pending")
        if task["status"] not in {"pending", "running", "done", "blocked", "cancelled"}:
            task["status"] = "pending"
        deps = task.get("dependsOn", [])
        task["dependsOn"] = [str(x) for x in deps] if isinstance(deps, list) else []
        task["attempts"] = int(task.get("attempts", 0) or 0)
        task["notes"] = str(task.get("notes", ""))[:2000]
        normalized.append(task)
    plan["tasks"] = normalized
    plan["goal"] = str(plan.get("goal", ""))[:5000]
    plan["status"] = str(plan.get("status", "idle"))
    ids = {t["id"] for t in normalized}
    if plan.get("currentTaskId") not in ids:
        plan["currentTaskId"] = None
    return plan


def normalize_memory(project, value):
    memory = default_memory(project)
    if isinstance(value, dict):
        for key in memory:
            if key in value:
                memory[key] = value[key]
    memory["version"] = MEMORY_VERSION
    memory["project"] = project_name(project)
    memory["updatedAt"] = now_iso()
    memory["context"] = str(memory.get("context", ""))[:12000]
    for key in ("completedTasks", "pendingTasks", "knownErrors", "tests", "history"):
        if not isinstance(memory.get(key), list):
            memory[key] = []
        memory[key] = memory[key][-MAX_HISTORY:]
    memory["tests"] = memory["tests"][-MAX_TESTS:]
    memory["plan"] = normalize_plan(memory.get("plan"))
    return memory


def read_memory(project):
    path = memory_path(project)
    if not path.exists():
        memory = default_memory(project)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(memory, ensure_ascii=False, indent=2), encoding="utf-8")
        return memory
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        value = default_memory(project)
    return normalize_memory(project, value)


def write_memory(project, memory):
    path = memory_path(project)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = normalize_memory(project, memory)
    path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized


def compact(value, limit=MAX_TEXT):
    text = str(value or "")
    return text if len(text) <= limit else text[:limit] + "\n...[truncado]"


def plan_read(project):
    return normalize_plan(read_memory(project).get("plan"))


def plan_write(project, plan):
    memory = read_memory(project)
    memory["plan"] = normalize_plan(plan)
    return write_memory(project, memory)["plan"]


def plan_update(project, task_id, status=None, notes=None, attempts=None):
    memory = read_memory(project)
    plan = normalize_plan(memory.get("plan"))
    found = None
    for task in plan["tasks"]:
        if task["id"] == str(task_id):
            found = task
            break
    if found is None:
        raise ValueError(f"Tarefa nao encontrada: {task_id}")
    if status is not None:
        found["status"] = str(status)
    if notes is not None:
        found["notes"] = str(notes)[:2000]
    if attempts is not None:
        found["attempts"] = max(0, int(attempts))
    if found["status"] == "running":
        plan["currentTaskId"] = found["id"]
        plan["status"] = "active"
    elif found["status"] in {"done", "blocked", "cancelled"} and plan.get("currentTaskId") == found["id"]:
        plan["currentTaskId"] = None
    if plan["tasks"] and all(t["status"] in {"done", "cancelled"} for t in plan["tasks"]):
        plan["status"] = "completed"
    return write_memory(project, {**memory, "plan": plan})["plan"]


def plan_next(project):
    memory = read_memory(project)
    plan = normalize_plan(memory.get("plan"))
    done = {t["id"] for t in plan["tasks"] if t["status"] in {"done", "cancelled"}}
    blocked = {t["id"] for t in plan["tasks"] if t["status"] == "blocked"}
    current = next((t for t in plan["tasks"] if t["status"] == "running"), None)
    if current:
        return {"task": current, "plan": plan}
    for task in plan["tasks"]:
        if task["status"] != "pending":
            continue
        if task["id"] in blocked:
            continue
        if all(dep in done for dep in task.get("dependsOn", [])):
            task["status"] = "running"
            task["attempts"] = int(task.get("attempts", 0))
            plan["currentTaskId"] = task["id"]
            plan["status"] = "active"
            saved = write_memory(project, {**memory, "plan": plan})
            return {"task": next(t for t in saved["plan"]["tasks"] if t["id"] == task["id"]), "plan": saved["plan"]}
    if plan["tasks"] and all(t["status"] in {"done", "cancelled"} for t in plan["tasks"]):
        plan["status"] = "completed"
    return {"task": None, "plan": write_memory(project, {**memory, "plan": plan})["plan"]}


def record_event(project, op, req, result=None, error=None):
    if not project or op.startswith("agent.memory.") or op.startswith("agent.plan."):
        return
    try:
        memory = read_memory(project)
        event = {"at": now_iso(), "op": op, "ok": error is None}
        if req.get("id") is not None:
            event["id"] = req.get("id")
        if op == "fs.write":
            event["path"] = req.get("path", "")
            event["bytes"] = result.get("bytes", 0) if isinstance(result, dict) else 0
        elif op == "fs.read":
            event["path"] = req.get("path", "")
        elif op in {"fs.mkdir", "fs.delete"}:
            event["path"] = req.get("path", "")
        elif op == "fs.rename":
            event["from"] = req.get("from", "")
            event["to"] = req.get("to", "")
        elif op == "process.run":
            event["command"] = req.get("command", "")
            event["args"] = [str(x) for x in req.get("args", [])]
            if isinstance(result, dict):
                event["exitCode"] = result.get("exitCode")
                event["stdout"] = compact(result.get("stdout", ""))
                event["stderr"] = compact(result.get("stderr", ""))
        elif op == "project.create":
            event["project"] = result.get("project") if isinstance(result, dict) else project_name(project)
        else:
            event["result"] = compact(json.dumps(result, ensure_ascii=False))
        if error is not None:
            event["error"] = compact(error)
            memory["knownErrors"].append({"at": event["at"], "op": op, "error": compact(error)})
            memory["knownErrors"] = memory["knownErrors"][-MAX_HISTORY:]
        if op == "process.run" and isinstance(result, dict):
            memory["tests"].append({"at": event["at"], "command": result.get("command", req.get("command", "")), "args": [str(x) for x in req.get("args", [])], "exitCode": result.get("exitCode"), "stdout": compact(result.get("stdout", "")), "stderr": compact(result.get("stderr", ""))})
            memory["tests"] = memory["tests"][-MAX_TESTS:]
        memory["history"].append(event)
        memory["history"] = memory["history"][-MAX_HISTORY:]
        write_memory(project, memory)
    except Exception:
        pass


def execute(req):
    op = req.get("op")
    project = req.get("project")

    if op == "project.create":
        name = project_name(req.get("name"))
        path = project_dir(name)
        path.mkdir(parents=True, exist_ok=True)
        read_memory(name)
        result = {"project": name, "path": str(path), "memoryFile": MEMORY_FILE}
        record_event(name, op, req, result=result)
        return result

    if not project:
        raise ValueError("Projeto obrigatorio")
    project = project_name(project)

    if op == "agent.memory.read":
        return {"project": project, "memoryFile": MEMORY_FILE, "memory": read_memory(project)}
    if op == "agent.memory.write":
        return {"project": project, "memoryFile": MEMORY_FILE, "memory": write_memory(project, req.get("memory", {}))}
    if op == "agent.plan.read":
        return {"project": project, "plan": plan_read(project)}
    if op == "agent.plan.write":
        return {"project": project, "plan": plan_write(project, req.get("plan", {}))}
    if op == "agent.plan.update":
        return {"project": project, "plan": plan_update(project, req.get("taskId"), req.get("status"), req.get("notes"), req.get("attempts"))}
    if op == "agent.plan.next":
        result = plan_next(project)
        return {"project": project, **result}

    base, target = safe_path(project, req.get("path", ""))
    base.mkdir(parents=True, exist_ok=True)

    if op == "project.status":
        memory = read_memory(project)
        plan = normalize_plan(memory.get("plan"))
        return {"project": project, "exists": base.exists(), "root": str(base), "memoryFile": MEMORY_FILE, "memoryUpdatedAt": memory.get("updatedAt"), "knownErrors": len(memory.get("knownErrors", [])), "tests": len(memory.get("tests", [])), "planStatus": plan.get("status"), "currentTaskId": plan.get("currentTaskId"), "planTasks": len(plan.get("tasks", []))}

    if op == "fs.mkdir":
        target.mkdir(parents=True, exist_ok=True)
        result = {"path": req.get("path", "")}
        record_event(project, op, req, result=result)
        return result
    if op == "fs.write":
        target.parent.mkdir(parents=True, exist_ok=True)
        content = str(req.get("content", ""))
        target.write_text(content, encoding="utf-8")
        result = {"path": req.get("path", ""), "bytes": len(content.encode("utf-8"))}
        record_event(project, op, req, result=result)
        return result
    if op == "fs.read":
        result = {"path": req.get("path", ""), "content": target.read_text(encoding="utf-8")}
        record_event(project, op, req, result={"path": req.get("path", "")})
        return result
    if op == "fs.list":
        entries = [{"name": item.name, "type": "directory" if item.is_dir() else "file"} for item in (target.iterdir() if target.exists() else [])]
        result = {"path": req.get("path", ""), "entries": entries}
        record_event(project, op, req, result=result)
        return result
    if op == "fs.delete":
        if target.is_dir(): shutil.rmtree(target)
        elif target.exists(): target.unlink()
        result = {"path": req.get("path", "")}
        record_event(project, op, req, result=result)
        return result
    if op == "fs.rename":
        _, source = safe_path(project, req.get("from", ""))
        _, destination = safe_path(project, req.get("to", ""))
        destination.parent.mkdir(parents=True, exist_ok=True)
        source.rename(destination)
        result = {"from": req.get("from", ""), "to": req.get("to", "")}
        record_event(project, op, req, result=result)
        return result
    if op == "process.run":
        command = str(req.get("command", "")).strip()
        executable = Path(command).name.lower()
        if executable not in ALLOWED_EXECUTABLES: raise ValueError(f"Executavel nao permitido: {command}")
        args = [str(x) for x in req.get("args", [])]
        cwd = req.get("cwd", "")
        working = safe_path(project, cwd)[1] if cwd else base
        timeout = min(max(float(req.get("timeout", 30)), 1), 120)
        completed = subprocess.run([command, *args], cwd=working, capture_output=True, text=True, timeout=timeout, shell=False)
        result = {"exitCode": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr, "command": command, "cwd": str(working)}
        record_event(project, op, req, result=result)
        return result

    raise ValueError(f"Operacao desconhecida: {op}")


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)
    def do_OPTIONS(self): self._send(204, {})
    def do_GET(self):
        if urlparse(self.path).path == "/health":
            self._send(200, {"ok": True, "service": "bingo-python-bridge", "workspace": str(ROOT), "port": PORT, "allowedExecutables": sorted(ALLOWED_EXECUTABLES), "persistentMemory": MEMORY_FILE, "planner": True, "memoryVersion": MEMORY_VERSION})
        else: self._send(404, {"ok": False, "error": "not_found"})
    def do_POST(self):
        if urlparse(self.path).path != "/tool": self._send(404, {"ok": False, "error": "not_found"}); return
        req = {}
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 16 * 1024 * 1024: raise ValueError("Mensagem muito grande")
            req = json.loads(self.rfile.read(length).decode("utf-8"))
            result = execute(req)
            self._send(200, {"ok": True, "id": req.get("id"), "op": req.get("op"), "result": result})
        except subprocess.TimeoutExpired: self._send(408, {"ok": False, "id": req.get("id"), "error": "process_timeout"})
        except Exception as exc:
            if req.get("project") and req.get("op") and not str(req.get("op")).startswith(("agent.memory.", "agent.plan.")):
                try: record_event(project_name(req.get("project")), req.get("op"), req, error=str(exc))
                except Exception: pass
            self._send(400, {"ok": False, "id": req.get("id"), "error": str(exc)})
    def log_message(self, *_): return


if __name__ == "__main__":
    print(f"BINGO Python Bridge ativo em http://{HOST}:{PORT}")
    print(f"Workspace: {ROOT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
