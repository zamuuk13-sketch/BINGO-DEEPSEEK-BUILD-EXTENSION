(() => {
  'use strict';

  const HOST = 'com.bingo.deepseek.build';
  let port = null;
  let sequence = 0;
  const pending = new Map();

  function connect() {
    if (port) return port;
    port = chrome.runtime.connectNative(HOST);
    port.onMessage.addListener(message => {
      const item = message?.id ? pending.get(message.id) : null;
      if (!item) return;
      pending.delete(message.id);
      item(message);
    });
    port.onDisconnect.addListener(() => {
      const reason = chrome.runtime.lastError?.message || 'Native bridge desconectado.';
      for (const resolve of pending.values()) resolve({ ok: false, error: { code: 'BRIDGE_DISCONNECTED', message: reason } });
      pending.clear();
      port = null;
    });
    return port;
  }

  function call(tool, args) {
    return new Promise(resolve => {
      const id = `native-${Date.now()}-${++sequence}`;
      pending.set(id, resolve);
      try {
        connect().postMessage({ protocol: 1, id, op: tool, ...args });
      } catch (error) {
        pending.delete(id);
        resolve({ ok: false, error: { code: 'BRIDGE_SEND_FAILED', message: error.message } });
      }
    });
  }

  globalThis.BingoNativeBridge = { call, disconnect: () => port?.disconnect() };
})();
