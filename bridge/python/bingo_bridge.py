import json
import os
import shutil
import subprocess
import threading
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


def execute(req):
    op = req.get("op")
    project = req.get("project")

    if op == "project.create":
        name = project_name(req.get("name"))
        path = project_dir(name)
        path.mkdir(parents=True, exist_ok=True)
        return {"project": name, "path": str(path)}

    if not project:
        raise ValueError("Projeto obrigatorio")

    base, target = safe_path(project, req.get("path", ""))
    base.mkdir(parents=True, exist_ok=True)

    if op == "project.status":
        return {"project": project_name(project), "exists": base.exists(), "root": str(base)}

    if op == "fs.mkdir":
        target.mkdir(parents=True, exist_ok=True)
        return {"path": req.get("path", "")}

    if op == "fs.write":
        target.parent.mkdir(parents=True, exist_ok=True)
        content = str(req.get("content", ""))
        target.write_text(content, encoding="utf-8")
        return {"path": req.get("path", ""), "bytes": len(content.encode("utf-8"))}

    if op == "fs.read":
        return {"path": req.get("path", ""), "content": target.read_text(encoding="utf-8")}

    if op == "fs.list":
        entries = []
        for item in target.iterdir() if target.exists() else []:
            entries.append({"name": item.name, "type": "directory" if item.is_dir() else "file"})
        return {"path": req.get("path", ""), "entries": entries}

    if op == "fs.delete":
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return {"path": req.get("path", "")}

    if op == "fs.rename":
        _, source = safe_path(project, req.get("from", ""))
        _, destination = safe_path(project, req.get("to", ""))
        destination.parent.mkdir(parents=True, exist_ok=True)
        source.rename(destination)
        return {"from": req.get("from", ""), "to": req.get("to", "")}

    if op == "process.run":
        command = str(req.get("command", "")).strip()
        executable = Path(command).name.lower()
        if executable not in ALLOWED_EXECUTABLES:
            raise ValueError(f"Executavel nao permitido: {command}")
        args = [str(x) for x in req.get("args", [])]
        cwd = req.get("cwd", "")
        working = safe_path(project, cwd)[1] if cwd else base
        timeout = min(max(float(req.get("timeout", 30)), 1), 120)
        completed = subprocess.run(
            [command, *args], cwd=working, capture_output=True, text=True,
            timeout=timeout, shell=False
        )
        return {
            "exitCode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "command": command,
        }

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

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            self._send(200, {"ok": True, "service": "bingo-python-bridge", "workspace": str(ROOT), "port": PORT})
        else:
            self._send(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        if urlparse(self.path).path != "/tool":
            self._send(404, {"ok": False, "error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 16 * 1024 * 1024:
                raise ValueError("Mensagem muito grande")
            req = json.loads(self.rfile.read(length).decode("utf-8"))
            result = execute(req)
            self._send(200, {"ok": True, "id": req.get("id"), "op": req.get("op"), "result": result})
        except subprocess.TimeoutExpired:
            self._send(408, {"ok": False, "id": req.get("id") if 'req' in locals() else None, "error": "process_timeout"})
        except Exception as exc:
            self._send(400, {"ok": False, "id": req.get("id") if 'req' in locals() else None, "error": str(exc)})

    def log_message(self, *_):
        return


if __name__ == "__main__":
    print(f"BINGO Python Bridge ativo em http://{HOST}:{PORT}")
    print(f"Workspace: {ROOT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
