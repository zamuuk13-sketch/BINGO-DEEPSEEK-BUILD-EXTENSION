importScripts('agent/native-bridge.js');

const sessions = new Map();

function sessionFor(tabId) {
  if (!sessions.has(tabId)) {
    sessions.set(tabId, {
      name: 'DeepSeek-Project', files: {}, folders: new Set(), history: [],
      processedCommands: new Set(), startedAt: Date.now()
    });
  }
  return sessions.get(tabId);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'BINGO_TOOL_CALL') {
    if (typeof tabId !== 'number') { sendResponse({ ok:false, error:{ message:'Aba invalida.' } }); return true; }
    const allowed = new Set(['project.create','project.status','fs.mkdir','fs.write','fs.read','fs.list','fs.delete','fs.rename','process.run']);
    if (!allowed.has(msg.tool)) { sendResponse({ ok:false, error:{ message:`Ferramenta nao permitida: ${msg.tool}` } }); return true; }
    BingoNativeBridge.call(msg.tool, msg.args || {}).then(result => {
      sendResponse({ ...result, requestId: msg.requestId, tool: msg.tool });
    });
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
