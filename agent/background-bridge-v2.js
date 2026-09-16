/* BINGO Extension Stage 2 — isolated bridge controller. */
importScripts('../background.js');

const BINGO_DESKTOP_V2 = 'http://127.0.0.1:8766';
const bridgeConnections = new Map();

async function bridgeRequest(path, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${BINGO_DESKTOP_V2}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {'Content-Type':'application/json', ...(options.headers || {})}
    });
    let data;
    try { data = await response.json(); } catch (_) { throw new Error(`Relay HTTP ${response.status} sem JSON.`); }
    if (!response.ok || !data.ok) throw new Error(data.error || `Relay HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (msg.type === 'BINGO_DESKTOP_CONNECT') {
    const connectionId = String(msg.connectionId || `tab-${tabId || 'unknown'}`);
    bridgeRequest('/connect', {method:'POST', body:JSON.stringify({chat_name:msg.chatName || 'DeepSeek', connection_id:connectionId})})
      .then(data => { bridgeConnections.set(tabId, {connectionId, connectedAt:Date.now(), failures:0}); sendResponse({...data, connectionId}); })
      .catch(error => sendResponse({ok:false,error:error.message || String(error)}));
    return true;
  }
  if (msg.type === 'BINGO_DESKTOP_STATUS') {
    bridgeRequest('/status').then(data => sendResponse(data)).catch(error => sendResponse({ok:false,error:error.message || String(error)}));
    return true;
  }
  if (msg.type === 'BINGO_DESKTOP_SEND') {
    const connection = bridgeConnections.get(tabId);
    if (!connection || connection.connectionId !== msg.connectionId) {
      sendResponse({ok:false,error:'Conexão BINGO não registrada para esta aba.'});
      return true;
    }
    bridgeRequest('/outbound', {method:'GET'}).then(data => sendResponse(data)).catch(error => sendResponse({ok:false,error:error.message || String(error)}));
    return true;
  }
  if (msg.type === 'BINGO_DESKTOP_ASSISTANT') {
    const connection = bridgeConnections.get(tabId);
    if (!connection) { sendResponse({ok:false,error:'Bridge não conectada.'}); return true; }
    bridgeRequest('/inbound', {method:'POST', body:JSON.stringify({text:msg.text || '', connection_id:connection.connectionId})})
      .then(data => sendResponse(data)).catch(error => sendResponse({ok:false,error:error.message || String(error)}));
    return true;
  }
  if (msg.type === 'BINGO_DESKTOP_DISCONNECT') {
    bridgeRequest('/disconnect', {method:'POST', body:'{}'})
      .then(data => { bridgeConnections.delete(tabId); sendResponse(data); })
      .catch(error => { bridgeConnections.delete(tabId); sendResponse({ok:false,error:error.message || String(error)}); });
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => bridgeConnections.delete(tabId));
