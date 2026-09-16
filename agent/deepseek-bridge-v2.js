/* BINGO Extension Stage 4 — DeepSeek Bridge using Protocol V2. */
(() => {
  'use strict';
  const core = globalThis.BingoExtension;
  const protocol = globalThis.BingoProtocolV2;
  if (!core || !protocol) return;

  const state = {
    status: 'disconnected', connectionId: null, chatName: 'DeepSeek',
    lastHeartbeat: 0, lastChange: Date.now(), failures: 0, reconnecting: false
  };
  let heartbeatTimer = null;
  let reconnectTimer = null;

  function emit() { window.dispatchEvent(new CustomEvent('bingo:bridge-status', {detail: {...state}})); }
  function setStatus(status, extra = {}) { Object.assign(state, {status, lastChange: Date.now(), ...extra}); emit(); }
  async function config() { return core.getConfig(); }

  async function sendEnvelope(envelope, signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = value => { if (!settled) { settled = true; resolve(value); } };
      const fail = error => { if (!settled) { settled = true; reject(error); } };
      const timer = setTimeout(() => fail(Object.assign(new Error('Background sem resposta.'), {code:'NO_RESPONSE'})), 7000);
      try {
        chrome.runtime.sendMessage({type:'BINGO_PROTOCOL_V2', envelope}, response => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) return fail(new Error(chrome.runtime.lastError.message));
          if (!response?.ok) return fail(Object.assign(new Error(response?.error?.message || response?.error || 'Falha na Bridge.'), {code:response?.error?.code}));
          finish(response.envelope || response);
        });
        signal?.addEventListener('abort', () => { clearTimeout(timer); fail(Object.assign(new Error('Request cancelado.'), {code:'CANCELLED'})); }, {once:true});
      } catch (error) { clearTimeout(timer); fail(error); }
    });
  }

  async function connect(reason = 'startup') {
    if (state.status === 'connecting' || state.status === 'connected') return {...state};
    setStatus('connecting', {reconnecting: reason !== 'startup'});
    try {
      const cfg = await config();
      const connectionId = state.connectionId || `ds-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const request = protocol.create('connect', {chatName:state.chatName, connectionId}, {id:protocol.sessionId() + '_connect'});
      const response = await protocol.request(sendEnvelope, request, {timeout:8000, retries:2});
      if (!response?.success) throw new Error(response?.error?.message || 'Desktop relay indisponível.');
      state.connectionId = connectionId; state.failures = 0;
      setStatus('connected', {reconnecting:false, lastHeartbeat:Date.now()});
      startHeartbeat(cfg.heartbeatMs || 5000);
      core.log('info', 'DeepSeek Bridge V2 conectado', {connectionId, reason});
    } catch (error) {
      state.failures += 1; setStatus('error', {reconnecting:false});
      core.log('warn', 'Falha ao conectar DeepSeek Bridge V2', {error:error?.message || String(error)});
      scheduleReconnect();
    }
    return {...state};
  }

  async function disconnect() {
    clearTimeout(reconnectTimer); clearInterval(heartbeatTimer);
    heartbeatTimer = null; reconnectTimer = null;
    if (state.connectionId) {
      try {
        const request = protocol.create('disconnect', {connectionId:state.connectionId});
        await protocol.request(sendEnvelope, request, {timeout:4000, retries:1});
      } catch (_) {}
    }
    state.connectionId = null;
    setStatus('disconnected', {reconnecting:false});
  }

  function scheduleReconnect() {
    if (reconnectTimer || state.status === 'connected') return;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      const cfg = await config();
      if (cfg.autoReconnect !== false) connect('reconnect');
    }, Math.min(15000, 1000 * Math.max(1, state.failures)));
  }

  function startHeartbeat(interval) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      if (state.status !== 'connected') return;
      try {
        const request = protocol.create('heartbeat', {connectionId:state.connectionId});
        const response = await protocol.request(sendEnvelope, request, {timeout:4000, retries:1});
        if (!response?.success) throw new Error(response?.error?.message || 'Relay sem resposta.');
        state.lastHeartbeat = Date.now(); state.failures = 0; emit();
      } catch (error) {
        state.failures += 1; setStatus('error');
        core.log('warn', 'Heartbeat V2 falhou', {error:error?.message || String(error)});
        scheduleReconnect();
      }
    }, Math.max(1000, interval || 5000));
  }

  async function send(text) {
    if (state.status !== 'connected') await connect('send');
    const request = protocol.create('message', {text:String(text || ''), connectionId:state.connectionId});
    return protocol.request(sendEnvelope, request, {timeout:10000, retries:2});
  }

  async function cancel(requestId) { return protocol.cancel(requestId); }

  window.BingoDeepSeekBridge = Object.freeze({connect, disconnect, send, cancel, status:async()=>({...state}), protocol:protocol.version});
  window.addEventListener('beforeunload', () => { clearInterval(heartbeatTimer); clearTimeout(reconnectTimer); }, {passive:true});
  connect();
})();
