/* BINGO Extension Stage 9 — permission handshake with BINGO Client. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  const protocol = globalThis.BingoProtocolV2;
  const continuity = globalThis.BingoContinuityV7;
  if (!core || !protocol || !continuity) return;

  const VERSION = 1;
  const CATEGORIES = Object.freeze({
    filesystem: 'filesystem',
    terminal: 'terminal',
    internet: 'internet',
    installation: 'installation',
    computer: 'computer',
    admin: 'admin'
  });

  const state = {
    version: VERSION,
    connected: false,
    pending: new Map(),
    lastDecision: null,
    updatedAt: 0
  };

  function normalize(category) {
    const value = String(category || '').toLowerCase().trim();
    return Object.values(CATEGORIES).includes(value) ? value : 'computer';
  }

  function emit(reason) {
    state.updatedAt = Date.now();
    window.dispatchEvent(new CustomEvent('bingo:permission-updated', {
      detail: {version:VERSION, connected:state.connected, pending:[...state.pending.values()].map(sanitize), lastDecision:state.lastDecision, reason}
    }));
  }

  function sanitize(request) {
    return {
      id:request.id,
      category:request.category,
      operation:request.operation,
      reason:request.reason,
      details:core.safeClone(request.details),
      createdAt:request.createdAt
    };
  }

  function request(category, operation, reason, details = {}, options = {}) {
    const item = {
      id:`perm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
      category:normalize(category),
      operation:String(operation || 'unknown'),
      reason:String(reason || 'Permissão necessária.'),
      details:core.safeClone(details || {}),
      createdAt:Date.now(),
      timeout:Math.max(1000, Number(options.timeout || 120000))
    };
    state.pending.set(item.id, item);
    emit('request');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(item.id);
        emit('timeout');
        reject(Object.assign(new Error('Permissão expirou ou não foi respondida.'), {code:'PERMISSION_TIMEOUT'}));
      }, item.timeout);

      item.resolve = decision => {
        clearTimeout(timer);
        state.pending.delete(item.id);
        state.lastDecision = {id:item.id, category:item.category, operation:item.operation, decision, at:Date.now()};
        emit('decision');
        if (decision === 'allow') resolve(true);
        else reject(Object.assign(new Error('Operação negada pelo usuário.'), {code:'PERMISSION_DENIED'}));
      };
    });
  }

  function decide(id, decision) {
    const item = state.pending.get(id);
    if (!item) return false;
    const normalized = decision === true || decision === 'allow' ? 'allow' : 'deny';
    item.resolve(normalized);
    return true;
  }

  async function clientRequest(category, operation, reason, details = {}, options = {}) {
    const item = {
      protocol:'BINGO',
      version:2,
      type:'permission_request',
      id:`perm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
      sessionId:continuity.get().sessionId || 'no-session',
      timestamp:Date.now(),
      category:normalize(category),
      operation:String(operation || 'unknown'),
      reason:String(reason || 'Permissão necessária.'),
      details:core.safeClone(details || {})
    };

    try {
      const response = await protocol.request((envelope) => new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({type:'BINGO_PERMISSION_REQUEST', message:envelope}, result => {
          if (chrome.runtime.lastError) return reject(Object.assign(new Error(chrome.runtime.lastError.message), {code:'TRANSPORT_ERROR'}));
          if (!result?.ok) return reject(Object.assign(new Error(result?.error?.message || 'BINGO Client indisponível.'), {code:'CLIENT_UNAVAILABLE'}));
          resolve(result.message || result);
        });
      }), item, options);

      if (response?.decision === 'allow' || response?.allowed === true) {
        await continuity.record('permission.allow', {currentAction:operation});
        return true;
      }
      await continuity.record('permission.deny', {currentAction:operation});
      throw Object.assign(new Error(response?.reason || 'Permissão negada.'), {code:'PERMISSION_DENIED'});
    } catch (error) {
      if (error?.code === 'PERMISSION_DENIED') throw error;
      return request(category, operation, reason, details, options);
    }
  }

  async function connect() {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({type:'BINGO_PERMISSION_STATUS'}, result => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(result);
        });
      });
      state.connected = !!response?.ok && response.connected !== false;
    } catch (_) {
      state.connected = false;
    }
    emit('connect');
    return state.connected;
  }

  window.BingoPermissionV9 = Object.freeze({
    version:VERSION,
    categories:CATEGORIES,
    state:() => ({version:VERSION, connected:state.connected, pending:[...state.pending.values()].map(sanitize), lastDecision:state.lastDecision}),
    connect,
    request:clientRequest,
    decide,
    pending:() => [...state.pending.values()].map(sanitize)
  });

  connect();
  core.log('info', 'Permission Handshake V9 ativo', {categories:Object.values(CATEGORIES)});
})();
