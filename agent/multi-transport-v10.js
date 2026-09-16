/* BINGO Extension Stage 10 — multi-transport manager with HTTP, WebSocket and runtime messaging fallback. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  const protocol = globalThis.BingoProtocolV2;
  if (!core || !protocol) return;

  const VERSION = 2;
  const DEFAULT_HTTP = 'http://127.0.0.1:8766';
  const DEFAULT_WS = 'ws://127.0.0.1:8766/ws';
  const transports = new Map();
  let preferred = 'websocket';
  let active = null;
  let connected = false;
  let sequence = 0;

  function emit(reason, extra = {}) {
    window.dispatchEvent(new CustomEvent('bingo:transport-status', {detail:{version:VERSION, connected, active, preferred, transports:[...transports.keys()], reason, ...extra}}));
  }

  function register(name, transport) {
    if (!name || !transport || typeof transport.send !== 'function') throw new Error('Transport inválido.');
    transports.set(name, transport);
    return api;
  }

  function unregister(name) {
    const transport = transports.get(name);
    try { transport?.close?.(); } catch (_) {}
    transports.delete(name);
    if (active === name) { active = null; connected = false; }
    emit('unregister');
  }

  async function tryTransport(name, payload, timeout = 8000) {
    const transport = transports.get(name);
    if (!transport) throw Object.assign(new Error(`Transport ${name} não registrado.`), {code:'TRANSPORT_MISSING'});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await Promise.race([
        Promise.resolve().then(() => transport.send(payload, controller.signal)),
        new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`Timeout do transport ${name}.`), {code:'TRANSPORT_TIMEOUT'})), timeout))
      ]);
    } finally { clearTimeout(timer); }
  }

  async function send(payload, options = {}) {
    const order = options.order || [preferred, ...[...transports.keys()].filter(name => name !== preferred)];
    let lastError = null;
    for (const name of order) {
      try {
        const result = await tryTransport(name, {...payload, transportId:`tx_${++sequence}`}, options.timeout || 8000);
        active = name;
        connected = true;
        emit('send-success', {transport:name});
        return {ok:true, transport:name, result};
      } catch (error) {
        lastError = error;
        core.log('warn', 'Falha no transport', {name, error:error?.message || String(error)});
        if (active === name) active = null;
      }
    }
    connected = false;
    emit('send-failed');
    throw lastError || new Error('Nenhum transport disponível.');
  }

  async function connect(options = {}) {
    const order = options.order || [preferred, ...[...transports.keys()].filter(name => name !== preferred)];
    for (const name of order) {
      const transport = transports.get(name);
      if (!transport) continue;
      try {
        await transport.connect?.(options);
        active = name;
        connected = true;
        emit('connected');
        return {ok:true, transport:name};
      } catch (error) {
        core.log('warn', 'Falha ao conectar transport', {name, error:error?.message || String(error)});
      }
    }
    connected = false;
    active = null;
    emit('connect-failed');
    return {ok:false};
  }

  async function disconnect() {
    for (const transport of transports.values()) { try { await transport.close?.(); } catch (_) {} }
    connected = false;
    active = null;
    emit('disconnected');
  }

  function status() { return {version:VERSION, connected, active, preferred, transports:[...transports.keys()]}; }

  const runtimeTransport = {
    async connect() { return true; },
    async send(payload) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({type:'BINGO_TRANSPORT_V10', payload}, response => {
          if (chrome.runtime.lastError) return reject(Object.assign(new Error(chrome.runtime.lastError.message), {code:'RUNTIME_ERROR'}));
          if (!response?.ok) return reject(Object.assign(new Error(response?.error?.message || 'Runtime transport falhou.'), {code:'RUNTIME_ERROR'}));
          resolve(response.result || response);
        });
      });
    }
  };

  const httpTransport = {
    base: DEFAULT_HTTP,
    async connect() {
      const response = await fetch(`${this.base}/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.ok === false) throw new Error(data.error || 'HTTP relay indisponível.');
      return true;
    },
    async send(payload, signal) {
      const response = await fetch(`${this.base}/transport`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal});
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    }
  };

  const websocketTransport = {
    url: DEFAULT_WS,
    socket: null,
    pending: new Map(),
    async connect() {
      if (typeof WebSocket === 'undefined') throw Object.assign(new Error('WebSocket indisponível.'), {code:'WS_UNAVAILABLE'});
      if (this.socket?.readyState === WebSocket.OPEN) return true;
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(this.url);
        this.socket = ws;
        const timer = setTimeout(() => { try { ws.close(); } catch (_) {} reject(Object.assign(new Error('WebSocket timeout.'), {code:'WS_TIMEOUT'})); }, 5000);
        ws.onopen = () => { clearTimeout(timer); resolve(true); };
        ws.onerror = () => { clearTimeout(timer); reject(Object.assign(new Error('Falha no WebSocket.'), {code:'WS_ERROR'})); };
        ws.onmessage = event => {
          let data; try { data = JSON.parse(event.data); } catch (_) { return; }
          const pending = this.pending.get(data?.id);
          if (!pending) return;
          this.pending.delete(data.id);
          clearTimeout(pending.timer);
          pending.resolve(data);
        };
        ws.onclose = () => { this.socket = null; };
      });
    },
    async send(payload, signal) {
      await this.connect();
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('WebSocket não conectado.');
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(payload.id); reject(Object.assign(new Error('Resposta WebSocket timeout.'), {code:'WS_TIMEOUT'})); }, 8000);
        this.pending.set(payload.id, {resolve, reject, timer});
        if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); this.pending.delete(payload.id); reject(Object.assign(new Error('WebSocket request cancelado.'), {code:'CANCELLED'})); }, {once:true});
        try { this.socket.send(JSON.stringify(payload)); } catch (error) { clearTimeout(timer); this.pending.delete(payload.id); reject(error); }
      });
    },
    close() { try { this.socket?.close(); } catch (_) {} this.socket = null; this.pending.clear(); }
  };

  register('websocket', websocketTransport);
  register('http', httpTransport);
  register('runtime', runtimeTransport);

  const api = Object.freeze({
    version:VERSION,
    register,
    unregister,
    send,
    connect,
    disconnect,
    status,
    setPreferred(name) { if (!transports.has(name)) throw new Error(`Transport ${name} não existe.`); preferred = name; emit('preferred'); },
    constants:Object.freeze({http:DEFAULT_HTTP, websocket:DEFAULT_WS})
  });

  window.BingoMultiTransportV10 = api;
  core.log('info', 'Multi-Transport V10 ativo', {transports:[...transports.keys()], fallback:['websocket','http','runtime']});
})();
