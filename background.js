const sessions = new Map();
const PYTHON_BRIDGE = 'http://127.0.0.1:8765';
const REQUEST_TIMEOUT_MS = 125000;
const TOOLS = new Set([
  'project.create','project.status','agent.memory.read','agent.memory.write',
  'agent.plan.read','agent.plan.write','agent.plan.update','agent.plan.next',
  'fs.mkdir','fs.write','fs.read','fs.list','fs.delete','fs.rename','process.run'
]);

function sessionFor(tabId) {
  if (!sessions.has(tabId)) {
    sessions.set(tabId, {
      name: 'DeepSeek-Project', files: {}, folders: new Set(), history: [],
      processedCommands: new Set(), startedAt: Date.now(), plan: null
    });
  }
  return sessions.get(tabId);
}

async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function pythonCall(tool, args) {
  if (!TOOLS.has(tool)) throw new Error(`Ferramenta nao permitida: ${tool}`);
  const response = await fetchWithTimeout(`${PYTHON_BRIDGE}/tool`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: `bingo-${Date.now()}-${Math.random().toString(16).slice(2)}`, op: tool, ...args })
  });
  let data;
  try { data = await response.json(); } catch { throw new Error(`Bridge retornou HTTP ${response.status} sem JSON valido.`); }
  if (!response.ok || !data.ok) throw new Error(data.error || `Python Bridge HTTP ${response.status}`);
  return data;
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
    pythonCall(msg.tool, msg.args || {}).then(result => {
      const session = sessionFor(tabId);
      if (msg.tool.startsWith('agent.plan.') && result.ok) session.plan = result.result?.plan || null;
      if (msg.tool === 'project.create' && result.ok) session.name = result.result?.project || session.name;
      sendResponse({...result, requestId:msg.requestId, tool:msg.tool, transport:'python-http'});
    }).catch(error => {
      const message = error?.name === 'AbortError' ? 'Tempo limite da bridge excedido.' : (error.message || String(error));
      sendResponse({ok:false,requestId:msg.requestId,tool:msg.tool,error:{message},transport:'python-http'});
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
    session.name = msg.name || session.name; session.files = msg.files || {};
    session.folders = new Set(msg.folders || []); session.history = msg.history || session.history;
    session.plan = msg.plan || session.plan; return;
  }
  if (msg.type === 'COMMAND_AUDIT') {
    session.history.push({at:Date.now(),id:msg.id || null,op:msg.op || 'unknown',ok:!!msg.ok,detail:msg.detail || ''});
    if (session.history.length > 100) session.history.shift(); return;
  }
  if (msg.type === 'GET_SESSION') {
    sendResponse({name:session.name,files:session.files,folders:[...session.folders],history:session.history,plan:session.plan}); return true;
  }
  if (msg.type === 'RESET_SESSION') { sessions.delete(tabId); sendResponse({ok:true}); return true; }
});

chrome.tabs.onRemoved.addListener(id => sessions.delete(id));
