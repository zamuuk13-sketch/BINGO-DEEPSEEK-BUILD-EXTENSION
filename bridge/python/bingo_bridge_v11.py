"""BINGO V11 production runtime with its own HTTP dispatcher."""
import json
import subprocess
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse
import bingo_bridge_v10 as base

V11_VERSION = 1
MAX_LEDGER = 500
MAX_CHECKPOINTS = 50
MAX_BODY = 16 * 1024 * 1024
lock = threading.Lock()
runtime = {}


def now_iso(): return datetime.now(timezone.utc).isoformat()
def core(): return base.base.base
def project_name(project): return core().project_name(project)
def project_dir(project): return core().project_dir(project)

def runtime_dir(project):
    path = project_dir(project_name(project)) / ".bingo"
    path.mkdir(parents=True, exist_ok=True)
    return path

def state_path(project): return runtime_dir(project) / "v11-runtime.json"

def load(project):
    project = project_name(project)
    if project in runtime: return runtime[project]
    data = {"version":V11_VERSION,"project":project,"session":None,"ledger":[],"checkpoints":[]}
    path = state_path(project)
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict): data.update(loaded)
        except Exception: pass
    runtime[project] = data
    return data

def save(project,data):
    project = project_name(project)
    data["version"] = V11_VERSION
    data["updatedAt"] = now_iso()
    state_path(project).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    runtime[project] = data

def ledger(project,event,payload=None):
    with lock:
        data=load(project)
        data.setdefault("ledger",[]).append({"at":now_iso(),"event":str(event),"payload":payload or {}})
        data["ledger"]=data["ledger"][-MAX_LEDGER:]
        save(project,data)
        return data["ledger"][-1]

def checkpoint(project,label="checkpoint"):
    project=project_name(project)
    snap=base.snapshot(project)
    with lock:
        data=load(project)
        item={"id":f"cp-{int(datetime.now().timestamp()*1000)}","label":str(label)[:200],"createdAt":now_iso(),"snapshot":snap}
        data.setdefault("checkpoints",[]).append(item)
        data["checkpoints"]=data["checkpoints"][-MAX_CHECKPOINTS:]
        save(project,data)
        return item

def autonomy_start(project,goal="",max_steps=20,resume=True):
    project=project_name(project); data=load(project); previous=data.get("session") if resume else None
    if previous and previous.get("active") and previous.get("goal")==str(goal or ""): return previous
    result=base.autonomy_start(project,goal,max_steps)
    result.update({"resumeSupported":True,"sessionId":f"auto-{int(datetime.now().timestamp()*1000)}"})
    with lock: data["session"]=result; save(project,data)
    ledger(project,"autonomy.start",{"sessionId":result["sessionId"],"goal":result["goal"]})
    checkpoint(project,"session-start")
    return result

def autonomy_step(project,action=None):
    project=project_name(project); result=base.autonomy_step(project,action)
    with lock:
        data=load(project)
        if data.get("session"): data["session"].update(result); data["session"]["lastActionAt"]=now_iso()
        save(project,data)
    ledger(project,"autonomy.step",{"step":result["steps"],"action":str(action or "")[:1000]})
    if result["steps"]%5==0: checkpoint(project,f"step-{result['steps']}")
    return result

def autonomy_stop(project):
    project=project_name(project); result=base.autonomy_stop(project)
    with lock:
        data=load(project)
        if data.get("session"): data["session"].update(result); data["session"]["stoppedAt"]=now_iso()
        save(project,data)
    ledger(project,"autonomy.stop",{"steps":result.get("steps",0)})
    checkpoint(project,"session-stop")
    return result

def runtime_status(project):
    data=load(project_name(project))
    return {"version":V11_VERSION,"project":data["project"],"session":data.get("session"),"ledgerSize":len(data.get("ledger",[])),"checkpointCount":len(data.get("checkpoints",[])),"latestCheckpoint":data.get("checkpoints",[])[-1] if data.get("checkpoints") else None}

def ledger_read(project,limit=50):
    data=load(project_name(project)); n=min(max(int(limit or 50),1),MAX_LEDGER)
    return {"project":data["project"],"events":data.get("ledger",[])[-n:]}

def checkpoint_list(project,limit=10):
    data=load(project_name(project)); n=min(max(int(limit or 10),1),MAX_CHECKPOINTS)
    return {"project":data["project"],"checkpoints":data.get("checkpoints",[])[-n:]}

def resume(project):
    data=load(project_name(project)); item=data.get("session")
    if not item: return {"resumed":False,"reason":"Nenhuma sessao persistida."}
    return {"resumed":bool(item.get("active")),"session":item,"reason":None if item.get("active") else "A ultima sessao esta parada."}

def health(project=None):
    result={"version":V11_VERSION,"status":"ok","runtime":"production","timestamp":now_iso(),"port":core().PORT}
    if project: result["project"]=runtime_status(project)
    return result

def execute(req):
    op=req.get("op"); project=req.get("project")
    if op=="agent.runtime.status": return runtime_status(project)
    if op=="agent.ledger.read": return ledger_read(project,req.get("limit",50))
    if op=="agent.checkpoint.create": return checkpoint(project,req.get("label","checkpoint"))
    if op=="agent.checkpoint.list": return checkpoint_list(project,req.get("limit",10))
    if op=="agent.session.resume": return resume(project)
    if op=="agent.health": return health(project)
    if op=="agent.autonomy.start": return autonomy_start(project,req.get("goal",""),req.get("maxSteps",20),req.get("resume",True))
    if op=="agent.autonomy.step": return autonomy_step(project,req.get("action",""))
    if op=="agent.autonomy.stop": return autonomy_stop(project)
    return base.execute(req)

class V11Handler(BaseHTTPRequestHandler):
    def send_json(self,status,data):
        body=json.dumps(data,ensure_ascii=False).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Content-Length",str(len(body)))
        self.send_header("Access-Control-Allow-Origin","*"); self.send_header("Access-Control-Allow-Headers","Content-Type"); self.send_header("Access-Control-Allow-Methods","GET, POST, OPTIONS"); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self): self.send_json(204,{})
    def do_GET(self):
        if urlparse(self.path).path=="/health": self.send_json(200,{"ok":True,"service":"bingo-python-bridge",**health()})
        else: self.send_json(404,{"ok":False,"error":"not_found"})
    def do_POST(self):
        if urlparse(self.path).path!="/tool": return self.send_json(404,{"ok":False,"error":"not_found"})
        req={}
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length>MAX_BODY: raise ValueError("Mensagem muito grande")
            req=json.loads(self.rfile.read(length).decode("utf-8")); result=execute(req)
            self.send_json(200,{"ok":True,"id":req.get("id"),"op":req.get("op"),"result":result})
        except subprocess.TimeoutExpired: self.send_json(408,{"ok":False,"id":req.get("id"),"error":"process_timeout"})
        except Exception as exc: self.send_json(400,{"ok":False,"id":req.get("id"),"error":str(exc)})
    def log_message(self,*_): return

if __name__=="__main__":
    print(f"BINGO Python Bridge V11 ativo em http://{core().HOST}:{core().PORT}")
    print(f"Workspace: {core().ROOT}")
    core().ThreadingHTTPServer((core().HOST,core().PORT),V11Handler).serve_forever()
