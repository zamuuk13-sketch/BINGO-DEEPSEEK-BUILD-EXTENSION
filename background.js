const sessions = new Map();
const PYTHON_BRIDGE = 'http://127.0.0.1:8765';
const REQUEST_TIMEOUT_MS = 125000;
const TOOLS = new Set([
  'project.create','project.status','agent.memory.read','agent.memory.write',
  'agent.plan.read','agent.plan.write','agent.plan.update','agent.plan.next','agent.verify',
  'fs.mkdir','fs.write','fs.read','fs.list','fs.delete','fs.rename','process.run'
]);

function sessionFor(tabId) {
  if (!sessions.has(tabId)) sessions.set(tabId, {
    name:'DeepSeek-Project', files:{}, folders:new Set(), history:[],
    processedCommands:new Set(), startedAt:Date.now(), plan:null, diagnostics:[]
  });
  return sessions.get(tabId);
}

async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, {...options, signal:controller.signal}); }
  finally { clearTimeout(timer); }
}

async function pythonCall(tool, args) {
  if (!TOOLS.has(tool)) throw new Error(`Ferramenta nao permitida: ${tool}`);
  const response = await fetchWithTimeout(`${PYTHON_BRIDGE}/tool`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:`bingo-${Date.now()}-${Math.random().toString(16).slice(2)}`,op:tool,...args})
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Bridge retornou HTTP ${response.status} sem JSON valido.`); }
  if (!response.ok || !data.ok) throw new Error(data.error || `Python Bridge HTTP ${response.status}`);
  return data;
}

function classifyDiagnostic(result) {
  const stdout = String(result?.stdout || '');
  const stderr = String(result?.stderr || '');
  const text = `${stderr}\n${stdout}`;
  const lower = text.toLowerCase();
  const rules = [
    ['syntax_error', /syntaxerror|parse error|unexpected token|unexpected identifier|unterminated string|expected .* before/],
    ['import_error', /modulenotfounderror|cannot find module|importerror|no module named/],
    ['file_not_found', /filenotfounderror|no such file|cannot open|does not exist|not found/],
    ['permission_error', /permission denied|access is denied|eperm|eacces/],
    ['type_error', /typeerror|invalid type|type mismatch/],
    ['reference_error', /referenceerror|is not defined|undefined variable/],
    ['godot_error', /godot.*error|parser error|invalid call|invalid get index|nonexistent function/],
    ['build_error', /error:|fatal error|linker|undefined reference|build failed|compilation failed/],
    ['runtime_error', /traceback|exception|panic|segmentation fault|crash/]
  ];
  if (result?.exitCode === 0 && !rules.some(([,re]) => re.test(text))) {
    return {status:'passed', category:null, summary:'O processo terminou com exitCode 0 e nenhum padrao conhecido de erro foi detectado.', evidence:[]};
  }
  const matches = rules.filter(([,re]) => re.test(text)).map(([name]) => name);
  const category = matches[0] || (result?.exitCode === 0 ? 'warning' : 'unknown_failure');
  const lines = text.split(/\r?\n/).filter(Boolean);
  return {
    status: result?.exitCode === 0 ? 'warning' : 'failed', category,
    summary: result?.exitCode === 0 ? 'O processo terminou, mas existem sinais que merecem verificacao.' : 'O processo falhou; o diagnostico deve orientar o proximo ciclo de correcao.',
    evidence: lines.slice(-12)
  };
}

async function verify(project, args) {
  const command = String(args.command || '').trim();
  if (!command) throw new Error('agent.verify exige command.');
  const run = await pythonCall('process.run', {
    project,
    command,
    args:Array.isArray(args.args) ? args.args : [],
    cwd:args.cwd || '',
    timeout:args.timeout || 30
  });
  const result = run.result || {};
  const diagnostic = classifyDiagnostic(result);
  const session = sessionFor(args.tabId || -1);
  if (diagnostic.status !== 'passed') {
    session.diagnostics.push({at:Date.now(),category:diagnostic.category,summary:diagnostic.summary});
    if (session.diagnostics.length > 30) session.diagnostics.shift();
  }
  return {...run, verifier:{version:1,...diagnostic,exitCode:result.exitCode,command:result.command,cwd:result.cwd}};
}

async function bridgeHealth() {
  const response = await fetchWithTimeout(`${PYTHON_BRIDGE}/health`, {}, 5000);
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `Python Bridge HTTP ${response.status}`);
  return data;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (msg.type === 'BINGO_TOOL_CALL') {
    if (typeof tabId !== 'number') { sendResponse({ok:false,error:{message:'Aba invalida.'}}); return true; }
    if (!TOOLS.has(msg.tool)) { sendResponse({ok:false,error:{message:`Ferramenta nao permitida: ${msg.tool}`}}); return true; }
    const args = {...(msg.args || {}), tabId};
    const call = msg.tool === 'agent.verify' ? verify(args.project, args) : pythonCall(msg.tool, args);
    call.then(result => {
      const session = sessionFor(tabId);
      if (msg.tool.startsWith('agent.plan.') && result.ok) session.plan = result.result?.plan || null;
      if (msg.tool === 'agent.verify') session.diagnostics.push(result.verifier);
      if (msg.tool === 'project.create' && result.ok) session.name = result.result?.project || session.name;
      sendResponse({...result,requestId:msg.requestId,tool:msg.tool,transport:'python-http+v8-verifier'});
    }).catch(error => {
      const message = error?.name === 'AbortError' ? 'Tempo limite da bridge excedido.' : (error.message || String(error));
      sendResponse({ok:false,requestId:msg.requestId,tool:msg.tool,error:{message},transport:'python-http+v8-verifier'});
    });
    return true;
  }
  if (msg.type === 'BINGO_BRIDGE_HEALTH') {
    bridgeHealth().then(data => sendResponse({ok:true,...data})).catch(error => sendResponse({ok:false,error:error.message || String(error)}));
    return true;
  }
  if (typeof tabId !== 'number') return;
  const session = sessionFor(tabId);
  if (msg.type === 'PROJECT_STATE') {
    session.name=msg.name||session.name; session.files=msg.files||{}; session.folders=new Set(msg.folders||[]);
    session.history=msg.history||session.history; session.plan=msg.plan||session.plan; return;
  }
  if (msg.type === 'COMMAND_AUDIT') {
    session.history.push({at:Date.now(),id:msg.id||null,op:msg.op||'unknown',ok:!!msg.ok,detail:msg.detail||''});
    if (session.history.length>100) session.history.shift(); return;
  }
  if (msg.type === 'GET_SESSION') {
    sendResponse({name:session.name,files:session.files,folders:[...session.folders],history:session.history,plan:session.plan,diagnostics:session.diagnostics.slice(-10)}); return true;
  }
  if (msg.type === 'RESET_SESSION') { sessions.delete(tabId); sendResponse({ok:true}); return true; }
});

chrome.tabs.onRemoved.addListener(id => sessions.delete(id));
