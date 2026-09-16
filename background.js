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
  if (!sessions.has(tabId)) sessions.set(tabId, {
    name:'DeepSeek-Project', files:{}, folders:new Set(), history:[],
    processedCommands:new Set(), startedAt:Date.now(), plan:null, diagnostics:[], runtime:null
  });
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
  const response = await fetchWithTimeout(`${PYTHON_BRIDGE}/tool`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:`bingo-${Date.now()}-${Math.random().toString(16).slice(2)}`,op:tool,...args})
  });
  let data;
  try { data=await response.json(); }
  catch { throw new Error(`Bridge retornou HTTP ${response.status} sem JSON valido.`); }
  if (!response.ok || !data.ok) throw new Error(data.error || `Python Bridge HTTP ${response.status}`);
  return data;
}

function classifyDiagnostic(result) {
  const stdout=String(result?.stdout||'');
  const stderr=String(result?.stderr||'');
  const text=`${stderr}\n${stdout}`;
  const rules=[
    ['syntax_error',/syntaxerror|parse error|unexpected token|unexpected identifier|unterminated string|expected .* before/i],
    ['import_error',/modulenotfounderror|cannot find module|importerror|no module named/i],
    ['file_not_found',/filenotfounderror|no such file|cannot open|does not exist|not found/i],
    ['permission_error',/permission denied|access is denied|eperm|eacces/i],
    ['type_error',/typeerror|invalid type|type mismatch/i],
    ['reference_error',/referenceerror|is not defined|undefined variable/i],
    ['godot_error',/godot.*error|parser error|invalid call|invalid get index|nonexistent function/i],
    ['build_error',/error:|fatal error|linker|undefined reference|build failed|compilation failed/i],
    ['runtime_error',/traceback|exception|panic|segmentation fault|crash/i]
  ];
  const matches=rules.filter(([,re])=>re.test(text)).map(([name])=>name);
  if (result?.exitCode===0 && !matches.length) return {status:'passed',category:null,summary:'Teste concluido sem sinais conhecidos de erro.',evidence:[]};
  const lines=text.split(/\r?\n/).filter(Boolean);
  return {status:result?.exitCode===0?'warning':'failed',category:matches[0] || (result?.exitCode===0?'warning':'unknown_failure'),summary:result?.exitCode===0?'O processo terminou, mas ha sinais que merecem verificacao.':'O processo falhou; use o diagnostico para orientar a correcao.',evidence:lines.slice(-12)};
}

function attachVerifier(result, tabId) {
  const verifier=classifyDiagnostic(result.result||{});
  const session=sessionFor(tabId);
  if (verifier.status!=='passed') {
    session.diagnostics.push({at:Date.now(),...verifier});
    if(session.diagnostics.length>30) session.diagnostics.shift();
  }
  return {...result,verifier:{version:1,...verifier,exitCode:result.result?.exitCode,command:result.result?.command,cwd:result.result?.cwd}};
}

async function verify(project,args,tabId) {
  const command=String(args.command||'').trim();
  if(!command) throw new Error('agent.verify exige command.');
  const run=await pythonCall('process.run',{project,command,args:Array.isArray(args.args)?args.args:[],cwd:args.cwd||'',timeout:args.timeout||30});
  return attachVerifier(run,tabId);
}

async function bridgeHealth() {
  const response = await fetchWithTimeout(`${PYTHON_BRIDGE}/health`,{},5000);
  const data = await response.json();
  if(!response.ok||!data.ok) throw new Error(data.error||`Python Bridge HTTP ${response.status}`);
  return data;
}

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  const tabId=sender.tab?.id;
  if(msg.type==='BINGO_TOOL_CALL'){
    if(typeof tabId!=='number'){sendResponse({ok:false,error:{message:'Aba invalida.'}});return true;}
    if(!TOOLS.has(msg.tool)){sendResponse({ok:false,error:{message:`Ferramenta nao permitida: ${msg.tool}`}});return true;}
    const args={...(msg.args||{})};
    let call;
    if(msg.tool==='agent.verify') call=verify(args.project,args,tabId);
    else call=pythonCall(msg.tool,args).then(result=>msg.tool==='process.run'?attachVerifier(result,tabId):result);
    call.then(result=>{
      const session=sessionFor(tabId);
      if(msg.tool.startsWith('agent.plan.')&&result.ok) session.plan=result.result?.plan||null;
      if(msg.tool==='project.create'&&result.ok) session.name=result.result?.project||session.name;
      if((msg.tool==='agent.runtime.status'||msg.tool==='agent.health')&&result.ok) session.runtime=result.result||result;
      sendResponse({...result,requestId:msg.requestId,tool:msg.tool,transport:'python-http+v11'});
    }).catch(error=>{
      const message=error?.name==='AbortError'?'Tempo limite da bridge excedido.':(error.message||String(error));
      sendResponse({ok:false,requestId:msg.requestId,tool:msg.tool,error:{message},transport:'python-http+v11'});
    });
    return true;
  }
  if(msg.type==='BINGO_BRIDGE_HEALTH'){
    bridgeHealth().then(data=>sendResponse({ok:true,...data})).catch(error=>sendResponse({ok:false,error:error.message||String(error)}));
    return true;
  }
  if(typeof tabId!=='number') return;
  const session=sessionFor(tabId);
  if(msg.type==='PROJECT_STATE'){
    session.name=msg.name||session.name;session.files=msg.files||{};session.folders=new Set(msg.folders||[]);session.history=msg.history||session.history;session.plan=msg.plan||session.plan;return;
  }
  if(msg.type==='COMMAND_AUDIT'){
    session.history.push({at:Date.now(),id:msg.id||null,op:msg.op||'unknown',ok:!!msg.ok,detail:msg.detail||''});
    if(session.history.length>100)session.history.shift();return;
  }
  if(msg.type==='GET_SESSION'){
    sendResponse({name:session.name,files:session.files,folders:[...session.folders],history:session.history,plan:session.plan,diagnostics:session.diagnostics.slice(-10),runtime:session.runtime});return true;
  }
  if(msg.type==='RESET_SESSION'){sessions.delete(tabId);sendResponse({ok:true});return true;}
});

chrome.tabs.onRemoved.addListener(id=>sessions.delete(id));
