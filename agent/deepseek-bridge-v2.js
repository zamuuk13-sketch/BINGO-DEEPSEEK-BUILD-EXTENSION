/* BINGO Extension Stage 2 — DeepSeek Bridge manager. */
(() => {
  const core = globalThis.BingoExtension;
  if (!core) return;

  const state = {
    status: 'disconnected',
    connectionId: null,
    chatName: 'DeepSeek',
    lastHeartbeat: 0,
    lastChange: Date.now(),
    failures: 0,
    reconnecting: false
  };

  let heartbeatTimer = null;
  let reconnectTimer = null;

  function emit() {
    window.dispatchEvent(new CustomEvent('bingo:bridge-status', {detail: {...state}}));
  }

  function setStatus(status, extra = {}) {
    Object.assign(state, {status, lastChange: Date.now(), ...extra});
    emit();
  }

  async function config() { return core.getConfig(); }

  async function connect(reason = 'startup') {
    if (state.status === 'connecting' || state.status === 'connected') return {...state};
    setStatus('connecting', {reconnecting: reason !== 'startup'});
    try {
      const cfg = await config();
      const connectionId = state.connectionId || `ds-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await chrome.runtime.sendMessage({type:'BINGO_DESKTOP_CONNECT', chatName:state.chatName, connectionId});
      if (!response?.ok) throw new Error(response?.error || 'Desktop relay indisponível.');
      state.connectionId = connectionId;
      state.failures = 0;
      setStatus('connected', {reconnecting:false, lastHeartbeat:Date.now()});
      startHeartbeat(cfg.heartbeatMs || 5000);
      core.log('info', 'DeepSeek Bridge conectado', {connectionId, reason});
    } catch (error) {
      state.failures += 1;
      setStatus('error', {reconnecting:false});
      core.log('warn', 'Falha ao conectar DeepSeek Bridge', {error:error?.message || String(error)});
      scheduleReconnect();
    }
    return {...state};
  }

  async function disconnect() {
    clearTimeout(reconnectTimer);
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    try { await chrome.runtime.sendMessage({type:'BINGO_DESKTOP_DISCONNECT'}); } catch (_) {}
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
        const response = await chrome.runtime.sendMessage({type:'BINGO_DESKTOP_STATUS'});
        if (!response?.ok) throw new Error(response?.error || 'Relay sem resposta.');
        state.lastHeartbeat = Date.now();
        state.failures = 0;
        emit();
      } catch (error) {
        state.failures += 1;
        setStatus('error');
        core.log('warn', 'Heartbeat da Bridge falhou', {error:error?.message || String(error)});
        scheduleReconnect();
      }
    }, Math.max(1000, interval || 5000));
  }

  async function send(text) {
    if (state.status !== 'connected') await connect('send');
    const response = await chrome.runtime.sendMessage({type:'BINGO_DESKTOP_SEND', text:String(text || ''), connectionId:state.connectionId});
    if (!response?.ok) throw new Error(response?.error || 'Falha ao enviar pela Bridge.');
    return response;
  }

  window.BingoDeepSeekBridge = Object.freeze({connect, disconnect, send, status:async()=>({...state})});
  window.addEventListener('beforeunload', () => { clearInterval(heartbeatTimer); clearTimeout(reconnectTimer); }, {passive:true});
  connect();
})();
