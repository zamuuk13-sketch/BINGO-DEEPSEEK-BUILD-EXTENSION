"""BINGO Stage 14 diagnostics runtime layered on Stage 13."""
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone

import bingo_bridge_v13 as base

V14_VERSION=1
MAX_OUTPUT=12000
_started=time.monotonic()


def core(): return base.core()
def project_name(project): return base.project_name(project)
def project_dir(project): return base.project_dir(project)


def run_readonly(command, timeout=10):
    p=subprocess.run(command,capture_output=True,text=True,timeout=timeout,shell=False)
    return {"exitCode":p.returncode,"stdout":(p.stdout or "")[:MAX_OUTPUT],"stderr":(p.stderr or "")[:MAX_OUTPUT]}


def system_info(project=None):
    return {"os":platform.system(),"release":platform.release(),"version":platform.version(),"machine":platform.machine(),"processor":platform.processor(),"python":platform.python_version(),"hostname":socket.gethostname(),"project":project_name(project) if project else None}


def cpu_info(project=None):
    logical=os.cpu_count() or 1
    result={"logicalCpus":logical,"processor":platform.processor()}
    if os.name=="nt":
        try:
            out=run_readonly(["wmic","cpu","get","Name,NumberOfCores,NumberOfLogicalProcessors","/value"],5)
            result["wmic"]=out
        except Exception as exc: result["wmicError"]=str(exc)
    return result


def memory_info(project=None):
    if os.name=="nt":
        try:
            out=run_readonly(["wmic","OS","get","TotalVisibleMemorySize,FreePhysicalMemory","/value"],5)
            return {"source":"wmic","data":out}
        except Exception as exc: return {"source":"fallback","error":str(exc)}
    return {"source":"unknown","available":False}


def disk_info(project):
    path=project_dir(project_name(project)); path.mkdir(parents=True,exist_ok=True)
    total,used,free=shutil.disk_usage(path)
    return {"path":str(path),"total":total,"used":used,"free":free,"usedPercent":round((used/total)*100,2) if total else 0}


def network_info(project=None):
    host=socket.gethostname()
    addresses=[]
    try: addresses=sorted(set(socket.gethostbyname_ex(host)[2]))
    except Exception: pass
    dns={"host":"localhost","resolved":False}
    try: socket.gethostbyname("localhost"); dns["resolved"]=True
    except Exception: pass
    return {"hostname":host,"addresses":addresses,"dns":dns}


def processes_info(project=None):
    if os.name=="nt":
        try: return {"source":"tasklist","data":run_readonly(["tasklist","/FO","CSV","/NH"],10)}
        except Exception as exc: return {"source":"tasklist","error":str(exc)}
    try: return {"source":"ps","data":run_readonly(["ps","-eo","pid,comm"],10)}
    except Exception as exc: return {"source":"ps","error":str(exc)}


def python_info(project=None):
    return {"executable":sys.executable,"version":platform.python_version(),"implementation":platform.python_implementation(),"prefix":sys.prefix,"basePrefix":sys.base_prefix}


def project_info(project):
    project=project_name(project); path=project_dir(project)
    files=dirs=0
    for item in path.rglob("*"):
        if any(part in {".git",".godot","node_modules",".venv","venv","build","dist",".bingo"} for part in item.parts): continue
        if item.is_file(): files+=1
        elif item.is_dir(): dirs+=1
        if files+dirs>5000: break
    return {"project":project,"path":str(path),"exists":path.exists(),"files":files,"directories":dirs}


def health(project=None):
    return {"status":"ok","version":V14_VERSION,"timestamp":datetime.now(timezone.utc).isoformat(),"uptimeSeconds":round(time.monotonic()-_started,3),"python":python_info(project),"system":system_info(project)}


def tools_info(project=None):
    return {"stage":14,"categories":["diagnostics"],"tools":["diagnostics.snapshot","diagnostics.health","diagnostics.system","diagnostics.cpu","diagnostics.memory","diagnostics.disk","diagnostics.network","diagnostics.processes","diagnostics.python","diagnostics.project","diagnostics.tools","diagnostics.report"]}


def snapshot(project):
    return {"health":health(project),"system":system_info(project),"cpu":cpu_info(project),"memory":memory_info(project),"disk":disk_info(project),"network":network_info(project),"project":project_info(project),"python":python_info(project)}


def execute(req):
    op=req.get("op"); project=req.get("project")
    if op=="diagnostics.snapshot": return snapshot(project)
    if op=="diagnostics.health": return health(project)
    if op=="diagnostics.system": return system_info(project)
    if op=="diagnostics.cpu": return cpu_info(project)
    if op=="diagnostics.memory": return memory_info(project)
    if op=="diagnostics.disk": return disk_info(project)
    if op=="diagnostics.network": return network_info(project)
    if op=="diagnostics.processes": return processes_info(project)
    if op=="diagnostics.python": return python_info(project)
    if op=="diagnostics.project": return project_info(project)
    if op=="diagnostics.tools": return tools_info(project)
    if op=="diagnostics.report": return {"generatedAt":datetime.now(timezone.utc).isoformat(),"report":snapshot(project),"tools":tools_info(project)}
    return base.execute(req)

base.execute=execute

if __name__=="__main__":
    print(f"BINGO Python Bridge V14 ativo em http://{core().HOST}:{core().PORT}")
    core().ThreadingHTTPServer((core().HOST,core().PORT),base.base.V11Handler).serve_forever()
