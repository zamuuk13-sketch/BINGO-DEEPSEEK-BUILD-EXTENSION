"""BINGO Stage 13 terminal runtime built on the production V11 bridge."""
import os
import shlex
import shutil
import subprocess
from pathlib import Path

import bingo_bridge_v11 as base

V13_VERSION = 1
MAX_COMMAND = 20000
MAX_PIPE = 12


def core(): return base.core()
def project_name(project): return base.project_name(project)
def project_dir(project): return base.project_dir(project)


def parse_command(command):
    text = str(command or "").strip()
    if not text or len(text) > MAX_COMMAND:
        raise ValueError("Comando vazio ou grande demais")
    try:
        parts = shlex.split(text, posix=False)
    except ValueError as exc:
        raise ValueError(f"Comando invalido: {exc}")
    if not parts:
        raise ValueError("Comando vazio")
    parts[0] = parts[0].strip('"')
    return parts[0], [str(x).strip('"') for x in parts[1:]]


def check_executable(command):
    executable = Path(str(command)).name.lower()
    allowed = core().ALLOWED_EXECUTABLES
    if executable not in allowed:
        raise ValueError(f"Executavel nao permitido: {command}")
    return command


def terminal_run(project, command, timeout=30, cwd=""):
    executable, args = parse_command(command)
    check_executable(executable)
    req={"op":"process.run","project":project,"command":executable,"args":args,"cwd":cwd,"timeout":timeout}
    return base.execute(req)


def terminal_start(project, command, cwd=""):
    executable,args=parse_command(command)
    check_executable(executable)
    return base.base.start_process(project, executable, args, cwd)


def terminal_list(project=None):
    return base.base.list_processes(project)


def terminal_stop(session_id):
    return base.base.stop_process(session_id, False)


def terminal_which(name):
    name=str(name or "").strip()
    if not name: raise ValueError("Nome obrigatorio")
    path=shutil.which(name)
    return {"name":name,"available":bool(path),"path":path}


def terminal_env(project=None):
    return {"project":project_name(project) if project else None,"variables":sorted(os.environ.keys()),"count":len(os.environ)}


def terminal_cwd(project):
    project=project_name(project)
    path=project_dir(project)
    path.mkdir(parents=True,exist_ok=True)
    return {"project":project,"cwd":str(path)}


def terminal_shells(project=None):
    names=["cmd.exe","powershell.exe","pwsh.exe","bash.exe","sh.exe"]
    return {"project":project_name(project) if project else None,"shells":[{"name":n,"available":bool(shutil.which(n)),"path":shutil.which(n)} for n in names]}


def terminal_command_exists(name):
    return terminal_which(name)


def terminal_version(name,project):
    executable,_=parse_command(name)
    check_executable(executable)
    return terminal_run(project,f'{executable} --version',timeout=10)


def terminal_kill_tree(session_id):
    processes=base.base.processes
    item=processes.get(str(session_id))
    if not item: raise ValueError(f"Processo nao encontrado: {session_id}")
    pid=int(item["pid"])
    if os.name != "nt": return base.base.stop_process(session_id, True)
    completed=subprocess.run(["taskkill","/PID",str(pid),"/T","/F"],capture_output=True,text=True,timeout=10,shell=False)
    result=base.base.process_status(item)
    processes.pop(str(session_id),None)
    result.update({"treeKilled":completed.returncode==0,"taskkillExitCode":completed.returncode,"taskkillOutput":(completed.stdout or completed.stderr).strip()[:2000]})
    return result


def terminal_run_script(project,path):
    project=project_name(project)
    _,target=core().safe_path(project,path)
    if not target.exists() or not target.is_file(): raise ValueError("Script nao encontrado")
    suffix=target.suffix.lower()
    if suffix==".py": command="python"
    elif suffix==".js": command="node"
    else: raise ValueError("Stage 13 executa apenas scripts .py e .js")
    relative=str(target.relative_to(project_dir(project))).replace("\\","/")
    return base.execute({"op":"process.run","project":project,"command":command,"args":[relative]})


def terminal_capture(project,command,timeout=30,cwd=""):
    result=terminal_run(project,command,timeout,cwd)
    return {"ok":result.get("exitCode")==0,"command":result.get("command"),"cwd":result.get("cwd"),"exitCode":result.get("exitCode"),"stdout":result.get("stdout", ""),"stderr":result.get("stderr", "")}


def terminal_pipe(project,commands,timeout=30):
    if not isinstance(commands,list) or not commands or len(commands)>MAX_PIPE: raise ValueError(f"commands deve conter 1-{MAX_PIPE} comandos")
    results=[]
    for index,command in enumerate(commands):
        result=terminal_capture(project,str(command),timeout)
        result["index"]=index
        results.append(result)
        if not result["ok"]: break
    return {"project":project_name(project),"count":len(results),"stoppedOnError":any(not x["ok"] for x in results),"results":results}


_original_execute=base.execute

def execute(req):
    op=req.get("op"); project=req.get("project")
    if op=="terminal.run": return terminal_run(project,req.get("command"),req.get("timeout",30),req.get("cwd",""))
    if op=="terminal.start": return terminal_start(project,req.get("command"),req.get("cwd",""))
    if op=="terminal.stop": return terminal_stop(req.get("sessionId"))
    if op=="terminal.list": return terminal_list(project)
    if op=="terminal.which": return terminal_which(req.get("name"))
    if op=="terminal.env": return terminal_env(project)
    if op=="terminal.cwd": return terminal_cwd(project)
    if op=="terminal.shells": return terminal_shells(project)
    if op=="terminal.command_exists": return terminal_command_exists(req.get("name"))
    if op=="terminal.version": return terminal_version(req.get("name"),project)
    if op=="terminal.kill_tree": return terminal_kill_tree(req.get("sessionId"))
    if op=="terminal.run_script": return terminal_run_script(project,req.get("path"))
    if op=="terminal.capture": return terminal_capture(project,req.get("command"),req.get("timeout",30),req.get("cwd",""))
    if op=="terminal.pipe": return terminal_pipe(project,req.get("commands",[]),req.get("timeout",30))
    return _original_execute(req)


base.execute=execute

if __name__=="__main__":
    print(f"BINGO Python Bridge V13 ativo em http://{core().HOST}:{core().PORT}")
    print(f"Workspace: {core().ROOT}")
    core().ThreadingHTTPServer((core().HOST,core().PORT),base.V11Handler).serve_forever()
