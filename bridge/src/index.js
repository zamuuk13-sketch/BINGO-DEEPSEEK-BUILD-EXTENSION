const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PROTOCOL_VERSION = 1;
const ROOT = path.resolve(process.env.BINGO_WORKSPACE || path.join(os.homedir(), 'BingoProjects'));
const ALLOWED_COMMANDS = new Set(['project.create','project.status','fs.mkdir','fs.write','fs.read','fs.list','fs.delete','fs.rename','process.run']);
const ALLOWED_EXECUTABLES = new Set([
  'godot', 'godot.exe', 'node', 'node.exe', 'npm', 'npm.cmd', 'npx', 'npx.cmd',
  'python', 'python.exe', 'py', 'py.exe', 'gcc', 'gcc.exe', 'g++', 'g++.exe',
  'cmake', 'cmake.exe', 'cargo', 'cargo.exe', 'rustc', 'rustc.exe'
]);

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}
function fail(id, code, message) { send({ protocol:PROTOCOL_VERSION, id, ok:false, error:{code,message} }); }
function safeProject(name) {
  const clean = String(name || '').trim().replace(/[^a-zA-Z0-9._ -]/g, '_');
  if (!clean || clean === '.' || clean === '..') throw new Error('Nome de projeto inválido');
  return clean;
}
function safePath(project, relative = '') {
  const projectDir = path.resolve(ROOT, safeProject(project));
  const target = path.resolve(projectDir, String(relative).replace(/\\/g, '/'));
  if (target !== projectDir && !target.startsWith(projectDir + path.sep)) throw new Error('Caminho fora do projeto bloqueado');
  return { projectDir, target };
}
function ensureProject(project) { const {projectDir} = safePath(project); fs.mkdirSync(projectDir,{recursive:true}); return projectDir; }

async function execute(command) {
  const {id,op,project,path:relative,content,from,to,cwd,args=[],timeout=30000} = command;
  if (!ALLOWED_COMMANDS.has(op)) return fail(id,'COMMAND_NOT_ALLOWED',`Operação não permitida: ${op}`);
  try {
    if (op === 'project.create') {
      const name=safeProject(command.name), projectDir=ensureProject(name);
      return send({protocol:PROTOCOL_VERSION,id,ok:true,op,project:name,path:projectDir});
    }
    const projectName=safeProject(project); ensureProject(projectName);
    if (op === 'project.status') {
      const {projectDir}=safePath(projectName);
      return send({protocol:PROTOCOL_VERSION,id,ok:true,op,project:projectName,exists:fs.existsSync(projectDir),root:projectDir});
    }
    if (op === 'fs.mkdir') { const {target}=safePath(projectName,relative); fs.mkdirSync(target,{recursive:true}); return send({protocol:PROTOCOL_VERSION,id,ok:true,op,path:relative}); }
    if (op === 'fs.write') {
      const {target}=safePath(projectName,relative), value=String(content ?? '');
      fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,value,'utf8');
      return send({protocol:PROTOCOL_VERSION,id,ok:true,op,path:relative,bytes:Buffer.byteLength(value,'utf8')});
    }
    if (op === 'fs.read') { const {target}=safePath(projectName,relative), value=fs.readFileSync(target,'utf8'); return send({protocol:PROTOCOL_VERSION,id,ok:true,op,path:relative,content:value}); }
    if (op === 'fs.list') {
      const {target}=safePath(projectName,relative || ''), entries=fs.existsSync(target)?fs.readdirSync(target,{withFileTypes:true}).map(e=>({name:e.name,type:e.isDirectory()?'directory':'file'})):[];
      return send({protocol:PROTOCOL_VERSION,id,ok:true,op,path:relative||'',entries});
    }
    if (op === 'fs.delete') { const {target}=safePath(projectName,relative); fs.rmSync(target,{recursive:true,force:false}); return send({protocol:PROTOCOL_VERSION,id,ok:true,op,path:relative}); }
    if (op === 'fs.rename') {
      const a=safePath(projectName,from).target,b=safePath(projectName,to).target;
      fs.mkdirSync(path.dirname(b),{recursive:true}); fs.renameSync(a,b); return send({protocol:PROTOCOL_VERSION,id,ok:true,op,from,to});
    }
    if (op === 'process.run') {
      const workingDir=cwd?safePath(projectName,cwd).target:safePath(projectName).projectDir;
      const executable=String(command.command || ''), base=path.basename(executable).toLowerCase();
      if (!ALLOWED_EXECUTABLES.has(base)) throw new Error(`Executável não permitido: ${base}`);
      const child=spawn(executable,Array.isArray(args)?args.map(String):[],{cwd:workingDir,shell:false,windowsHide:true});
      let stdout='',stderr=''; child.stdout.on('data',d=>stdout+=d.toString()); child.stderr.on('data',d=>stderr+=d.toString());
      const timer=setTimeout(()=>child.kill(),Math.min(Number(timeout)||30000,120000));
      child.on('close',code=>{clearTimeout(timer);send({protocol:PROTOCOL_VERSION,id,ok:code===0,op,exitCode:code,stdout,stderr});});
      return;
    }
  } catch(error) { fail(id,'EXECUTION_ERROR',error.message); }
}

let input=Buffer.alloc(0);
process.stdin.on('data',chunk=>{
  input=Buffer.concat([input,chunk]);
  while(input.length>=4){
    const length=input.readUInt32LE(0);
    if(length>16*1024*1024){fail(null,'MESSAGE_TOO_LARGE','Mensagem excede o limite.');process.exit(1);}
    if(input.length<4+length) break;
    const payload=input.subarray(4,4+length); input=input.subarray(4+length);
    try{execute(JSON.parse(payload.toString('utf8')));}catch(error){fail(null,'INVALID_JSON',error.message);}
  }
});
send({protocol:PROTOCOL_VERSION,event:'bridge.ready',workspace:ROOT,platform:process.platform,node:process.version});
