const sessions = new Map();
const PYTHON_BRIDGE = 'http://127.0.0.1:8765';
const REQUEST_TIMEOUT_MS = 125000;
const TOOLS = new Set([
  'project.create','project.status','agent.memory.read','agent.memory.write',
  'agent.plan.read','agent.plan.write','agent.plan.update','agent.plan.next','agent.verify',
  'env.inspect','project.scan','process.start','process.list','process.stop','artifact.list','workspace.snapshot',
  'agent.autonomy.start','agent.autonomy.stop','agent.autonomy.status','agent.autonomy.step','agent.batch',
  'agent.runtime.status','agent.ledger.read','agent.checkpoint.create','agent.checkpoint.list','agent.session.resume','agent.health',
  'fs.mkdir','fs.write','fs.read','fs.list','fs.delete','fs.rename','process.run'
]);

function sessionFor(tabId) {
  if (!sessions.has(tabId)) sessions.set(tabId, {name:'DeepSeek-Project', files:{}, folders:new Set(), history:[], processedCommands:new Set(), startedAt:Date.now(), plan:null, diagnostics:[], runtime:null});
  return sessions.get(tabId);
}

async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url,{...options,signal:controller.signal}); }
  finally { clearTimeout(timer); }
}

async function pythonCall(tool,args) {
  if (!TOOLS.has(tool)) throw new Error(`Ferramenta nao permitida: ${tool}`);
  const response = await fetchWithTimeout(`${PYTHON_BRIDGE}/tool`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:`bingo-${Date.now()}-${Math.random().toString(16).slice(2)}`,op:tool,...args})});
  let data;
  try { data=await response.json(); } catch { throw new Error(`Bridge retornou HTTP ${response.status} sem JSON valido.`); }
  if (!response.ok || !data.ok) throw new Error(data.error || `Python Bridge HTTP ${response.status}`);
  return data;
}

function classifyDiagnostic(result) {
  const stdout=String(result?.stdout||''), stderr=String(result?.stderr||''), text=`${stderr}\n${stdout}`;
  const rules=[['syntax_error',/syntaxerror|parse error|unexpected token|unexpected identifier|unterminated string|expected .* before/i],['import_error',/modulenotfounderror|cannot find module|importerror|no module named/i],['file_not_found',/filenotfounderror|no such file|cannot open|does not exist|not found/i],['permission_error',/permission denied|access is denied|eperm|eacces/i],['type_error',/typeerror|invalid type|type mismatch/i],['reference_error',/referenceerror|is not defined|undefined variable/i],['godot_error',/godot.*error|parser error|invalid call|invalid get index|nonexistent function/i],['build_error',/error:|fatal error|linker|undefined reference|build failed|compilation failed/i],['runtime_error',/traceback|exception|panic|segmentation fault|crash/i]];
  const matches=rules.filter(([,re])=>re.test(text)).map(([name])=>name);
  if (result?.exitCode===0 && !matches.length) return {status:'passed',category:null,summary:'Teste concluido sem sinais conhecidos de erro.',evidence:[]};
  return {status:result?.exitCode===0?'warning':'failed',category:matches[0]||(result?.exitCode===0?'warning':'unknown_failure'),summary:result?.exitCode===0?'O processo terminou, mas ha sinais que merecem verificacao.':'O processo falhou; use o diagnostico para orientar a correcao.',evidence:text.split(/\r?\n/).filter(Boolean).slice(-12)};
}
function attachVerifier(result, tabId) {
  const verifier=classifyDiagnostic(result.result||{}), session=sessionFor(tabId);
  if (verifier.status!=='passed') { session.diagnostics.push({at:Date.now(),...verifier}); if(session.diagnostics.length>30) session.diagnostics.shift(); }
  return {...result,verifier:{version:1,...verifier,exitCode:result.result?.exitCode,command:result.result?.command,cwd:result.result?.cwd}};
}
async function verify(project,args,tabId) { const command=String(args.command||'').trim(); if(!command) throw new Error('agent.verify exige command.'); return attachVerifier(await pythonCall('process.run',{project,command,args:Array.isArray(args.args)?args.args:[],cwd:args.cwd||'',timeout:args.timeout||30}),tabId); }
async function bridgeHealth() { const response=await fetchWithTimeout(`${PYTHON_BRIDGE}/health`,{},5000), data=await response.json(); if(!response.ok||!data.ok) throw new Error(data.error||`Python Bridge HTTP ${response.status}`); return data; }

async function executeTool(tool, args, tabId) {
  if (!TOOLS.has(tool)) throw Object.assign(new Error(`Ferramenta nao permitida: ${tool}`),{code:'UNKNOWN_TOOL'});
  const result = tool==='agent.verify' ? await verify(args.project,args,tabId) : await pythonCall(tool,args);
  const session=sessionFor(tabId);
  if(tool.startsWith('agent.plan.')&&result.ok) session.plan=result.result?.plan||null;
  if(tool==='project.create'&&result.ok) session.name=result.result?.project||session.name;
  if((tool==='agent.runtime.status'||tool==='agent.health')&&result.ok) session.runtime=result.result||result;
  return tool==='process.run' ? attachVerifier(result,tabId) : result;
}

function protocolResult(request, success, result, error=null) {
  return {protocol:'BINGO',version:2,type:success?'tool_result':'error',id:request?.id||`result_${Date.now()}`,sessionId:request?.sessionId||'unknown',timestamp:Date.now(),success,result:success?result:null,error:error?{code:error.code||'TOOL_ERROR',message:error.message||String(error)}:null};
}

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  const tabId=sender.tab?.id;
  if(msg.type==='BINGO_PROTOCOL_V2'){
    if(typeof tabId!=='number'){sendResponse({ok:false,error:{message:'Aba invalida.'}});return true;}
    const request=msg.message||{};
    if(request.protocol!=='BINGO'||Number(request.version)!==2){sendResponse({ok:false,error:{message:'Envelope BINGO V2 invalido.',code:'INVALID_PROTOCOL'}});return true;}
    if(request.type!=='tool_request'||typeof request.tool!=='string'){sendResponse({ok:false,message:protocolResult(request,false,null,Object.assign(new Error('Tool request invalido.'),{code:'INVALID_TOOL_REQUEST'}))});return true;}
    const args=(request.args&&typeof request.args==='object')?request.args:(request.payload?.args||{});
    executeTool(request.tool,args,tabId).then(result=>sendResponse({ok:true,message:protocolResult(request,true,result)})).catch(error=>sendResponse({ok:true,message:protocolResult(request,false,null,error)}));
    return true;
  }
  if(msg.type==='BINGO_TOOL_CALL'){
    if(typeof tabId!=='number'){sendResponse({ok:false,error:{message:'Aba invalida.'}});return true;}
    executeTool(msg.tool,{...(msg.args||{})},tabId).then(result=>sendResponse({...result,requestId:msg.requestId,tool:msg.tool,transport:'python-http+v11'})).catch(error=>sendResponse({ok:false,requestId:msg.requestId,tool:msg.tool,error:{message:error.message||String(error)},transport:'python-http+v11'}));
    return true;
  }
  if(msg.type==='BINGO_BRIDGE_HEALTH'){ bridgeHealth().then(data=>sendResponse({ok:true,...data})).catch(error=>sendResponse({ok:false,error:error.message||String(error)})); return true; }
  if(typeof tabId!=='number') return;
  const session=sessionFor(tabId);
  if(msg.type==='PROJECT_STATE'){session.name=msg.name||session.name;session.files=msg.files||{};session.folders=new Set(msg.folders||[]);session.history=msg.history||session.history;session.plan=msg.plan||session.plan;return;}
  if(msg.type==='COMMAND_AUDIT'){session.history.push({at:Date.now(),id:msg.id||null,op:msg.op||'unknown',ok:!!msg.ok,detail:msg.detail||''});if(session.history.length>100)session.history.shift();return;}
  if(msg.type==='GET_SESSION'){sendResponse({name:session.name,files:session.files,folders:[...session.folders],history:session.history,plan:session.plan,diagnostics:session.diagnostics.slice(-10),runtime:session.runtime});return true;}
  if(msg.type==='RESET_SESSION'){sessions.delete(tabId);sendResponse({ok:true});return true;}
});
chrome.tabs.onRemoved.addListener(id=>sessions.delete(id));
