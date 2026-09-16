/* BINGO Extension Stage 10 — multi-transport manager with HTTP, WebSocket and runtime messaging. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  if (!core) return;

  const VERSION = 1;
  const transports = new Map();
  let preferred = 'runtime';
  let connected = false;
  let active = null;
  let sequence = 0;

  function register(name, transport) {
    if (!name || !transport || typeof transport.send !== 'function') throw new Error('Transport inválido.');
    transports.set(name, transport);
    return api;
  }

  function unregister(name) {
    const transport = transports.get(name);
    try { transport?.close?.(); } catch (_) {}
    transports.delete(name);
    if (active === name) active = null;
  }

  async function tryTransport(name, payload, timeout = 8000) {
    const transport = transports.get(name);
    if (!transport) throw new Error(`Transport ${name} não registrado.`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await Promise.race([
        Promise.resolve().then(() => transport.send(payload, controller.signal)),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout do transport ${name}.`)), timeout))
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
        window.dispatchEvent(new CustomEvent('bingo:transport-status', {detail:{version:VERSION, connected:true, active, transportId:payload.transportId || null}}));
        return {ok:true, transport:name, result};
      } catch (error) {
        lastError = error;
        core.log('warn', 'Falha no transport', {name, error:error?.message || String(error)});
      }
    }
    connected = false;
    window.dispatchEvent(new CustomEvent('bingo:transport-status', {detail:{version:VERSION, connected:false, active:null}}));
    throw lastError || new Error('Nenhum transport disponível.');
  }

  async function connect() {
    for (const [name, transport] of transports) {
      try { await transport.connect?.(); active = name; connected = true; return {ok:true, transport:name}; } catch (_) {}
    }
    connected = false;
    return {ok:false};
  }

  async function disconnect() {
    for (const transport of transports.values()) { try { await transport.close?.(); } catch (_) {} }
    connected = false;
    active = null;
  }

  function status() {
    return {version:VERSION, connected, active, preferred, transports:[...transports.keys()]};
  }

  const runtimeTransport = {
    async send(payload) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({type:'BINGO_TRANSPORT_V10', payload}, response => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response?.ok) return reject(new Error(response?.error || 'Runtime transport falhou.'));
          resolve(response.result || response);
        });
      });
    }
  };

  const httpTransport = {
    base: 'http://127.0.0.1:8766',
    async send(payload, signal) {
      const response = await fetch(`${this.base}/transport`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal});
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    }
  };

  register('runtime', runtimeTransport);
  register('http', httpTransport);

  const api = Object.freeze({version:VERSION, register, unregister, send, connect, disconnect, status, setPreferred:name => { if (!transports.has(name)) throw new Error(`Transport ${name} não existe.`); preferred = name; }});
  window.BingoMultiTransportV10 = api;
  core.log('info', 'Multi-Transport V10 ativo', {transports:[...transports.keys()]});
})();
