"""BINGO Stage 15 — package and dependency manager runtime layered on Stage 14."""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
import bingo_bridge_v14 as base

V15_VERSION = 1
MAX_OUTPUT = 16000
MAX_PACKAGES = 100

def core(): return base.core()
def project_name(project): return base.project_name(project)
def project_dir(project): return base.project_dir(project)

def _project_path(project):
    path = project_dir(project_name(project))
    path.mkdir(parents=True, exist_ok=True)
    return path

def _run(command, cwd=None, timeout=120):
    if isinstance(command, str):
        raise ValueError("Comando precisa ser uma lista.")
    p = subprocess.run(command, cwd=str(cwd) if cwd else None, capture_output=True,
                       text=True, timeout=timeout, shell=False)
    return {"exitCode":p.returncode,"stdout":(p.stdout or "")[:MAX_OUTPUT],
            "stderr":(p.stderr or "")[:MAX_OUTPUT],"command":command}

def _which(*names):
    for name in names:
        found = shutil.which(name)
        if found: return found
    return None

def managers(project=None):
    return {
        "python":{"pip":_which("pip","pip3"),"python":_which("python","py")},
        "node":{"npm":_which("npm"),"npx":_which("npx"),"node":_which("node")},
        "rust":{"cargo":_which("cargo")},
        "cpp":{"cmake":_which("cmake"),"gcc":_which("gcc"),"gxx":_which("g++")},
        "godot":{"godot":_which("godot","godot4","godot_v4")}
    }

def detect(project=None):
    found = managers(project)
    flat = {}
    for category, items in found.items():
        for name, path in items.items():
            flat[name] = {"installed":bool(path),"path":path}
    return {"version":V15_VERSION,"managers":found,"tools":flat}

def _read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

def declared(project):
    root = _project_path(project)
    result = {}
    package_json = root / "package.json"
    if package_json.exists():
        data = _read_json(package_json) or {}
        result["npm"] = {k:data.get(k,{}) for k in ("dependencies","devDependencies","peerDependencies") if data.get(k)}
    for filename in ("requirements.txt","requirements-dev.txt"):
        path=root/filename
        if path.exists():
            lines=[]
            for raw in path.read_text(encoding="utf-8",errors="replace").splitlines():
                line=raw.strip()
                if line and not line.startswith("#") and not line.startswith("-"):
                    lines.append(line)
                if len(lines)>=MAX_PACKAGES: break
            result.setdefault("pip",{})[filename]=lines
    cargo = root/"Cargo.toml"
    if cargo.exists():
        text=cargo.read_text(encoding="utf-8",errors="replace")
        result["cargo"]={"manifest":str(cargo),"hasDependencies":"[dependencies]" in text}
    return {"project":str(root),"dependencies":result}

def _manager_bin(manager):
    m=manager.lower()
    mapping={
      "pip":["pip","pip3"],"npm":["npm"],"npx":["npx"],"cargo":["cargo"],
      "cmake":["cmake"],"godot":["godot","godot4","godot_v4"]
    }
    if m not in mapping: raise ValueError("Gerenciador não suportado.")
    path=_which(*mapping[m])
    if not path: raise FileNotFoundError(f"Gerenciador não encontrado: {manager}")
    return path

def _packages(value):
    if value is None: return []
    if isinstance(value,str): value=re.split(r"\s+",value.strip()) if value.strip() else []
    if not isinstance(value,list): raise ValueError("packages deve ser uma lista ou texto.")
    result=[str(x).strip() for x in value if str(x).strip()]
    if len(result)>MAX_PACKAGES: raise ValueError("Limite de 100 pacotes por operação.")
    if any(len(x)>200 or any(c in x for c in "\r\n;|") for x in result):
        raise ValueError("Nome de pacote inválido.")
    return result

def install(project,manager,packages):
    pkgs=_packages(packages); path=_project_path(project); m=manager.lower(); exe=_manager_bin(m)
    if not pkgs: raise ValueError("Nenhum pacote informado.")
    if m=="pip": cmd=[exe,"install",*pkgs]
    elif m=="npm": cmd=[exe,"install",*pkgs]
    elif m=="cargo": cmd=[exe,"add",*pkgs]
    else: raise ValueError("Instalação não suportada para esse gerenciador.")
    return _run(cmd,path)

def uninstall(project,manager,packages):
    pkgs=_packages(packages); path=_project_path(project); m=manager.lower(); exe=_manager_bin(m)
    if not pkgs: raise ValueError("Nenhum pacote informado.")
    if m=="pip": cmd=[exe,"uninstall","-y",*pkgs]
    elif m=="npm": cmd=[exe,"uninstall",*pkgs]
    elif m=="cargo": cmd=[exe,"remove",*pkgs]
    else: raise ValueError("Remoção não suportada para esse gerenciador.")
    return _run(cmd,path)

def update(project,manager,packages):
    pkgs=_packages(packages); path=_project_path(project); m=manager.lower(); exe=_manager_bin(m)
    if m=="pip": cmd=[exe,"install","--upgrade",*(pkgs or ["pip"])]
    elif m=="npm": cmd=[exe,"update",*pkgs]
    elif m=="cargo": cmd=[exe,"update",*pkgs]
    else: raise ValueError("Atualização não suportada para esse gerenciador.")
    return _run(cmd,path)

def check(project,manager=None):
    path=_project_path(project); m=(manager or "").lower()
    if not m:
        if (path/"package.json").exists(): m="npm"
        elif (path/"requirements.txt").exists() or (path/"requirements-dev.txt").exists(): m="pip"
        elif (path/"Cargo.toml").exists(): m="cargo"
        else: return {"detected":None,"message":"Nenhum manifesto conhecido encontrado."}
    exe=_manager_bin(m)
    if m=="pip": cmd=[exe,"check"]
    elif m=="npm": cmd=[exe,"install","--package-lock-only","--ignore-scripts"]
    elif m=="cargo": cmd=[exe,"check"]
    else: raise ValueError("Check não suportado para esse gerenciador.")
    return {"manager":m,"result":_run(cmd,path)}

def outdated(project,manager=None):
    path=_project_path(project); m=(manager or "").lower()
    if not m:
        if (path/"package.json").exists(): m="npm"
        elif (path/"requirements.txt").exists(): m="pip"
        elif (path/"Cargo.toml").exists(): m="cargo"
        else: return {"detected":None,"message":"Nenhum manifesto conhecido encontrado."}
    exe=_manager_bin(m)
    if m=="pip": cmd=[exe,"list","--outdated","--format","json"]
    elif m=="npm": cmd=[exe,"outdated","--json"]
    elif m=="cargo": cmd=[exe,"update","--dry-run"]
    else: raise ValueError("Outdated não suportado para esse gerenciador.")
    return {"manager":m,"result":_run(cmd,path)}

def run_script(project,manager,script):
    path=_project_path(project); m=manager.lower(); exe=_manager_bin(m)
    if not re.fullmatch(r"[A-Za-z0-9_:.@/-]{1,120}",str(script)):
        raise ValueError("Script inválido.")
    if m=="npm": cmd=[exe,"run",script]
    elif m=="cargo": cmd=[exe,"run","--bin",script]
    elif m=="pip": cmd=[sys.executable,"-m",script]
    else: raise ValueError("Run não suportado para esse gerenciador.")
    return _run(cmd,path)

def pip_action(project,action,packages):
    action=str(action).lower()
    if action=="install": return install(project,"pip",packages)
    if action=="uninstall": return uninstall(project,"pip",packages)
    if action in ("update","upgrade"): return update(project,"pip",packages)
    if action in ("check","outdated"): return check(project,"pip") if action=="check" else outdated(project,"pip")
    raise ValueError("Ação pip inválida.")

def npm_action(project,action,packages):
    action=str(action).lower()
    if action=="install": return install(project,"npm",packages)
    if action=="uninstall": return uninstall(project,"npm",packages)
    if action in ("update","upgrade"): return update(project,"npm",packages)
    if action=="check": return check(project,"npm")
    if action=="outdated": return outdated(project,"npm")
    raise ValueError("Ação npm inválida.")

def npx(project,command):
    exe=_manager_bin("npx"); tokens=re.findall(r"[A-Za-z0-9_@./:-]+",str(command))
    if not tokens or len(tokens)>30: raise ValueError("Comando npx inválido.")
    return _run([exe,*tokens],_project_path(project),120)

def cargo_action(project,action,packages):
    action=str(action).lower()
    if action=="install": return install(project,"cargo",packages)
    if action=="uninstall": return uninstall(project,"cargo",packages)
    if action in ("update","upgrade"): return update(project,"cargo",packages)
    if action=="check": return check(project,"cargo")
    if action=="outdated": return outdated(project,"cargo")
    raise ValueError("Ação cargo inválida.")

def tool_version(name):
    exe=_manager_bin(name)
    return _run([exe,"--version"],None,10)

def cmake(project=None): return tool_version("cmake")
def mingw(project=None):
    return {"gcc":_which("gcc"),"g++":_which("g++"),"mingw32-make":_which("mingw32-make"),
            "where":shutil.which("where") if os.name=="nt" else None}
def godot(project=None): return {"godot":_which("godot","godot4","godot_v4")}

def execute(req):
    op=req.get("op"); p=req.get("project")
    if op=="package.detect": return detect(p)
    if op=="package.managers": return managers(p)
    if op=="package.list": return declared(p)
    if op=="package.check": return check(p,req.get("manager"))
    if op=="package.outdated": return outdated(p,req.get("manager"))
    if op=="package.install": return install(p,req.get("manager",""),req.get("packages"))
    if op=="package.uninstall": return uninstall(p,req.get("manager",""),req.get("packages"))
    if op=="package.update": return update(p,req.get("manager",""),req.get("packages"))
    if op=="package.run": return run_script(p,req.get("manager",""),req.get("script",""))
    if op=="package.python.pip": return pip_action(p,req.get("action",""),req.get("packages"))
    if op=="package.node.npm": return npm_action(p,req.get("action",""),req.get("packages"))
    if op=="package.node.npx": return npx(p,req.get("command",""))
    if op=="package.cargo": return cargo_action(p,req.get("action",""),req.get("packages"))
    if op=="package.cmake": return cmake(p)
    if op=="package.mingw": return mingw(p)
    if op=="package.godot": return godot(p)
    return base.execute(req)

base.base.execute = execute

if __name__=="__main__":
    print(f"BINGO Python Bridge V15 ativo em http://{core().HOST}:{core().PORT}")
    core().ThreadingHTTPServer((core().HOST,core().PORT),base.base.V11Handler).serve_forever()
