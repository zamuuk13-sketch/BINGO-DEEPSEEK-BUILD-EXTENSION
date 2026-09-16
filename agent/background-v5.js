/* BINGO Extension Foundation + V5/V2 bridge background worker. */
importScripts('./extension-core.js', '../background.js');

const BINGO_DESKTOP = 'http://127.0.0.1:8766';
const bridgeConnections = new Map();
const PROTOCOL_VERSION = 2;

async function desktopRequest(path, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${BINGO_DESKTOP}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {'Content-Type':'application/json', ...(options.headers || {})}
    });
    let data;
    try { data = await response.json(); } catch (_) { throw new Error(`Desktop relay HTTP ${response.status} sem JSON.`); }
    if (!response.ok || !data.ok) throw new Error(data.error || `Desktop relay HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

function envelopeResult(request, success, result = null, error = null) {
  return {
    protocol:'BINGO', version:PROTOCOL_VERSION, type:success ? 'tool_result' : 'error',
    id:request?.id || `bg_${Date.now()}`, sessionId:request?.sessionId || 'unknown', timestamp:Date.now(),
    success:!!success, result:result || null,
    error:error ? {code:error.code || 'BRIDGE_ERROR', message:error.message || String(error), details:null} : null
  };
}

function validEnvelope(message) {
  return !!message && message.protocol === 'BINGO' && Number(message.version) === PROTOCOL_VERSION &&
    typeof message.type === 'string' && typeof message.id === 'string' && typeof message.sessionId === 'string';
}

async function handleProtocol(request, tabId) {
  if (!validEnvelope(request)) throw Object.assign(new Error('Envelope BINGO V2 inválido.'), {code:'INVALID_PROTOCOL'});
  const payload = request.payload || {};
  const connectionId = String(payload.connectionId || request.meta?.connectionId || '');
  const connection = bridgeConnections.get(tabId);

  if (request.type === 'connect') {
    const id = connectionId || `tab-${tabId || 'unknown'}`;
    const data = await desktopRequest('/connect', {method:'POST', body:JSON.stringify({chat_name:payload.chatName || 'DeepSeek', connection_id:id})});
    bridgeConnections.set(tabId, {connectionId:id, connectedAt:Date.now(), failures:0, sessionId:request.sessionId});
    return envelopeResult(request, true, {...data, connectionId:id, bridgeVersion:PROTOCOL_VERSION});
  }

  if (request.type === 'disconnect') {
    try { await desktopRequest('/disconnect', {method:'POST', body:'{}'}); }
    finally { bridgeConnections.delete(tabId); }
    return envelopeResult(request, true, {disconnected:true});
  }

  if (!connection) throw Object.assign(new Error('Conexão BINGO não registrada para esta aba.'), {code:'NOT_CONNECTED'});
  if (connectionId && connection.connectionId !== connectionId) throw Object.assign(new Error('Connection ID inválido.'), {code:'CONNECTION_MISMATCH'});

  if (request.type === 'heartbeat') {
    const data = await desktopRequest('/status');
    return envelopeResult(request, true, {connectionId:connection.connectionId, relay:data});
  }

  if (request.type === 'message') {
    const text = String(payload.text || '');
    if (!text) throw Object.assign(new Error('Mensagem vazia.'), {code:'EMPTY_MESSAGE'});
    const data = await desktopRequest('/inbound', {method:'POST', body:JSON.stringify({text, connection_id:connection.connectionId})});
    return envelopeResult(request, true, data);
  }

  if (request.type === 'cancel') {
    return envelopeResult(request, true, {cancelled:false, reason:'O relay atual não mantém cancelamento de mensagens já entregues.'});
  }

  throw Object.assign(new Error(`Tipo de mensagem BINGO V2 não suportado: ${request.type}`), {code:'UNSUPPORTED_TYPE'});
}

function reply(promise, sendResponse) {
  promise.then(sendResponse).catch(error => sendResponse({ok:false,error:{code:error.code || 'BRIDGE_ERROR',message:error.message || String(error)}}));
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'BINGO_PROTOCOL_V2') {
    return reply(handleProtocol(msg.envelope, tabId).then(envelope => ({ok:true,envelope})), sendResponse);
  }

  // Legacy V5 compatibility while the old V11 transport is still installed.
  if (msg.type === 'BINGO_DESKTOP_CONNECT') {
    const connectionId = String(msg.connectionId || `tab-${tabId || 'unknown'}`);
    return reply(desktopRequest('/connect', {method:'POST', body:JSON.stringify({chat_name:msg.chatName || 'DeepSeek', connection_id:connectionId})}).then(data => {
      bridgeConnections.set(tabId, {connectionId, connectedAt:Date.now(), failures:0});
      return {...data, connectionId, bridgeVersion:PROTOCOL_VERSION};
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
    sendResponse({ok:true, bridge:bridgeConnections.get(tabId) || null, version:PROTOCOL_VERSION});
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => bridgeConnections.delete(tabId));
BingoExtension?.log('info', 'Background Bridge V2 + Protocol V2 carregado', {version:BingoExtension.version, protocol:PROTOCOL_VERSION});
