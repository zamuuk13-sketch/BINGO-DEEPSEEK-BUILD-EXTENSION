/* BINGO Extension Foundation + V5/V2 DeepSeek bridge background worker. */
importScripts('./extension-core.js', '../background.js');

const BINGO_DESKTOP = 'http://127.0.0.1:8766';
const bridgeConnections = new Map();

async function desktopRequest(path, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${BINGO_DESKTOP}${path}`, {...options, signal:controller.signal, headers:{'Content-Type':'application/json', ...(options.headers || {})}});
    let data;
    try { data = await response.json(); } catch (_) { throw new Error(`Desktop relay HTTP ${response.status} sem JSON.`); }
    if (!response.ok || !data.ok) throw new Error(data.error || `Desktop relay HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

function reply(promise, sendResponse) {
  promise.then(sendResponse).catch(error => sendResponse({ok:false,error:error.message || String(error)}));
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (msg.type === 'BINGO_DESKTOP_CONNECT') {
    const connectionId = String(msg.connectionId || `tab-${tabId || 'unknown'}`);
    return reply(desktopRequest('/connect', {method:'POST', body:JSON.stringify({chat_name:msg.chatName || 'DeepSeek', connection_id:connectionId})}).then(data => {
      bridgeConnections.set(tabId, {connectionId, connectedAt:Date.now(), failures:0});
      return {...data, connectionId, bridgeVersion:2};
    }), sendResponse);
  }
  if (msg.type === 'BINGO_DESKTOP_STATUS') return reply(desktopRequest('/status'), sendResponse);
  if (msg.type === 'BINGO_DESKTOP_POLL') return reply(desktopRequest('/outbound'), sendResponse);
  if (msg.type === 'BINGO_DESKTOP_SEND') {
    const connection = bridgeConnections.get(tabId);
    if (!connection || connection.connectionId !== msg.connectionId) {
      sendResponse({ok:false,error:'Conexão BINGO não registrada para esta aba.'});
      return true;
    }
    return reply(desktopRequest('/inbound', {method:'POST', body:JSON.stringify({text:String(msg.text || ''), connection_id:connection.connectionId})}), sendResponse);
  }
  if (msg.type === 'BINGO_DESKTOP_ASSISTANT') {
    const connection = bridgeConnections.get(tabId);
    if (!connection) { sendResponse({ok:false,error:'Bridge não conectada.'}); return true; }
    return reply(desktopRequest('/inbound', {method:'POST', body:JSON.stringify({text:msg.text || '', connection_id:connection.connectionId})}), sendResponse);
  }
  if (msg.type === 'BINGO_DESKTOP_DISCONNECT') {
    return reply(desktopRequest('/disconnect', {method:'POST', body:'{}'}).finally(() => bridgeConnections.delete(tabId)), sendResponse);
  }
  if (msg.type === 'BINGO_EXTENSION_BRIDGE_STATUS') {
    sendResponse({ok:true, bridge:bridgeConnections.get(tabId) || null, version:2});
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => bridgeConnections.delete(tabId));
BingoExtension?.log('info', 'Background Bridge V2 carregado', {version:BingoExtension.version});
