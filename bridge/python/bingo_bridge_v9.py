"""BINGO V9 Environment extension.
Loads the existing V8 bridge and adds environment/session capabilities without duplicating the core bridge.
"""
import os
import platform
import shutil
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path

import bingo_bridge as base

V9_VERSION = 1
MAX_SCAN_FILES = 5000
MAX_SCAN_DEPTH = 12
process_lock = threading.Lock()
processes = {}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def executable_info(name):
    path = shutil.which(name)
    result = {"name": name, "available": bool(path), "path": path}
    if path:
        try:
            p = subprocess.run([name, "--version"], capture_output=True, text=True, timeout=5, shell=False)
            result["versionOutput"] = (p.stdout or p.stderr).strip()[:1000]
            result["exitCode"] = p.returncode
        except Exception as exc:
            result["versionError"] = str(exc)
    return result


def env_inspect(project=None):
    tools = ["python", "py", "node", "npm", "npx", "godot", "gcc", "g++", "cmake", "cargo", "rustc"]
    result = {"version": V9_VERSION, "timestamp": now_iso(), "platform": platform.platform(), "system": platform.system(), "release": platform.release(), "machine": platform.machine(), "python": platform.python_version(), "workspace": str(base.ROOT), "tools": {tool: executable_info(tool) for tool in tools}}
    if project:
        project = base.project_name(project)
        result["project"] = project
        result["projectRoot"] = str(base.project_dir(project))
    return result


def project_scan(project):
    project = base.project_name(project)
    root = base.project_dir(project)
    root.mkdir(parents=True, exist_ok=True)
    ignored = {".git", ".godot", "node_modules", "__pycache__", ".venv", "venv", "dist", "build"}
    files, dirs, extensions = [], [], {}
    for current, dirnames, filenames in os.walk(root):
        current_path = Path(current)
        rel_depth = len(current_path.relative_to(root).parts)
        dirnames[:] = [d for d in dirnames if d not in ignored]
        if rel_depth >= MAX_SCAN_DEPTH:
            dirnames[:] = []
        for d in dirnames:
            dirs.append(str((current_path / d).relative_to(root)).replace("\\", "/"))
        for filename in filenames:
            if len(files) >= MAX_SCAN_FILES:
                break
            path = current_path / filename
            rel = str(path.relative_to(root)).replace("\\", "/")
            files.append(rel)
            ext = path.suffix.lower() or "[no_extension]"
            extensions[ext] = extensions.get(ext, 0) + 1
        if len(files) >= MAX_SCAN_FILES:
            break
    names = set(files)
    engines = []
    if "project.godot" in names or (root / ".godot").exists(): engines.append("godot")
    if "package.json" in names: engines.append("node")
    if any(x.endswith(".py") for x in files): engines.append("python")
    if any(x.endswith((".cpp", ".cc", ".cxx", ".h", ".hpp")) for x in files): engines.append("cpp")
    if any(x.endswith(".rs") for x in files): engines.append("rust")
    return {"project": project, "root": str(root), "fileCount": len(files), "directoryCount": len(dirs), "truncated": len(files) >= MAX_SCAN_FILES, "engines": engines, "extensions": extensions, "files": files, "directories": dirs[:MAX_SCAN_FILES], "markers": {"godotProject": "project.godot" in names, "nodeProject": "package.json" in names, "pythonProject": any(x.endswith(".py") for x in files), "git": (root / ".git").exists()}}


def start_process(project, command, args=None, cwd=""):
    project = base.project_name(project)
    command = str(command or "").strip()
    executable = Path(command).name.lower()
    if executable not in base.ALLOWED_EXECUTABLES:
        raise ValueError(f"Executavel nao permitido: {command}")
    args = [str(x) for x in (args or [])]
    working = base.safe_path(project, cwd)[1] if cwd else base.project_dir(project)
    working.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen([command, *args], cwd=working, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=False)
    pid = proc.pid
    session_id = f"proc-{pid}-{int(datetime.now().timestamp())}"
    with process_lock:
        processes[session_id] = {"id": session_id, "pid": pid, "project": project, "command": command, "args": args, "cwd": str(working), "startedAt": now_iso(), "process": proc}
    return {"sessionId": session_id, "pid": pid, "project": project, "command": command, "args": args, "cwd": str(working), "status": "running"}


def process_status(item):
    code = item["process"].poll()
    return {"sessionId": item["id"], "pid": item["pid"], "project": item["project"], "command": item["command"], "args": item["args"], "cwd": item["cwd"], "startedAt": item["startedAt"], "status": "running" if code is None else "exited", "exitCode": code}


def list_processes(project=None):
    with process_lock: values = list(processes.values())
    wanted = base.project_name(project) if project else None
    return {"processes": [process_status(item) for item in values if not wanted or item["project"] == wanted]}


def stop_process(session_id, force=False):
    with process_lock: item = processes.get(str(session_id))
    if not item: raise ValueError(f"Processo nao encontrado: {session_id}")
    proc = item["process"]
    if proc.poll() is None:
        proc.kill() if force else proc.terminate()
        try: proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=5)
    result = process_status(item)
    with process_lock: processes.pop(str(session_id), None)
    return result


def artifact_list(project, path=""):
    project = base.project_name(project)
    root = base.safe_path(project, path)[1]
    if not root.exists(): return {"project": project, "path": path, "artifacts": []}
    items = []
    for p in root.iterdir():
        try:
            stat = p.stat()
            items.append({"name": p.name, "path": str(p.relative_to(base.project_dir(project))).replace("\\", "/"), "type": "directory" if p.is_dir() else "file", "size": stat.st_size if p.is_file() else None, "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()})
        except OSError: pass
    items.sort(key=lambda x: x["modifiedAt"], reverse=True)
    return {"project": project, "path": path, "artifacts": items[:1000]}


def snapshot(project):
    project = base.project_name(project)
    memory = base.read_memory(project)
    scan = project_scan(project)
    return {"timestamp": now_iso(), "project": project, "environment": env_inspect(project), "scan": {"fileCount": scan["fileCount"], "directoryCount": scan["directoryCount"], "engines": scan["engines"], "extensions": scan["extensions"]}, "plan": memory.get("plan"), "knownErrors": memory.get("knownErrors", [])[-10:], "recentTests": memory.get("tests", [])[-10:], "processes": list_processes(project)["processes"]}


_original_execute = base.execute

def execute(req):
    op = req.get("op")
    if op == "env.inspect": return env_inspect(req.get("project"))
    if op == "project.scan": return project_scan(req.get("project"))
    if op == "process.start": return start_process(req.get("project"), req.get("command"), req.get("args", []), req.get("cwd", ""))
    if op == "process.list": return list_processes(req.get("project"))
    if op == "process.stop": return stop_process(req.get("sessionId"), bool(req.get("force", False)))
    if op == "artifact.list": return artifact_list(req.get("project"), req.get("path", ""))
    if op == "workspace.snapshot": return snapshot(req.get("project"))
    return _original_execute(req)

base.execute = execute

if __name__ == "__main__":
    print(f"BINGO Python Bridge V9 ativo em http://{base.HOST}:{base.PORT}")
    print(f"Workspace: {base.ROOT}")
    base.ThreadingHTTPServer((base.HOST, base.PORT), base.Handler).serve_forever()
