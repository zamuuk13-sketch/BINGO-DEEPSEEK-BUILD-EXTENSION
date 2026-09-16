importScripts('agent/native-bridge.js');

const sessions = new Map();
const PYTHON_BRIDGE = 'http://127.0.0.1:8765';
const TOOLS = new Set(['project.create','project.status','fs.mkdir','fs.write','fs.read','fs.list','fs.delete','fs.rename','process.run']);

function sessionFor(tabId) {
  if (!sessions.has(tabId)) {
    sessions.set(tabId, {
      name: 'DeepSeek-Project', files: {}, folders: new Set(), history: [],
      processedCommands: new Set(), startedAt: Date.now()
    });
  }
  return sessions.get(tabId);
}

async function pythonCall(tool, args) {
  const response = await fetch(`${PYTHON_BRIDGE}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: `bingo-${Date.now()}-${Math.random().toString(16).slice(2)}`, op: tool, ...args })
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'Python Bridge error');
  return data;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'BINGO_TOOL_CALL') {
    if (typeof tabId !== 'number') { sendResponse({ ok:false, error:{ message:'Aba invalida.' } }); return true; }
    if (!TOOLS.has(msg.tool)) { sendResponse({ ok:false, error:{ message:`Ferramenta nao permitida: ${msg.tool}` } }); return true; }

    pythonCall(msg.tool, msg.args || {}).then(result => {
      sendResponse({ ...result, requestId: msg.requestId, tool: msg.tool, transport:'python-http' });
    }).catch(error => {
      sendResponse({ ok:false, requestId:msg.requestId, tool:msg.tool, error:{ message:error.message }, transport:'python-http' });
    });
    return true;
  }

  if (msg.type === 'BINGO_BRIDGE_HEALTH') {
    fetch(`${PYTHON_BRIDGE}/health`).then(r => r.json()).then(data => sendResponse({ ok:true, ...data }))
      .catch(error => sendResponse({ ok:false, error:error.message }));
    return true;
  }

  if (typeof tabId !== 'number') return;
  const session = sessionFor(tabId);

  if (msg.type === 'PROJECT_STATE') {
    session.name = msg.name || session.name;
    session.files = msg.files || {};
    session.folders = new Set(msg.folders || []);
    session.history = msg.history || session.history;
    return;
  }

  if (msg.type === 'COMMAND_AUDIT') {
    session.history.push({ at:Date.now(), id:msg.id || null, op:msg.op || 'unknown', ok:!!msg.ok, detail:msg.detail || '' });
    if (session.history.length > 100) session.history.shift();
    return;
  }

  if (msg.type === 'GET_SESSION') {
    sendResponse({ name:session.name, files:session.files, folders:[...session.folders], history:session.history });
    return true;
  }

  if (msg.type === 'RESET_SESSION') {
    sessions.delete(tabId);
    sendResponse({ ok:true });
    return true;
  }
});

chrome.tabs.onRemoved.addListener(id => sessions.delete(id));
