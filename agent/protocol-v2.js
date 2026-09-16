/* BINGO Extension Stage 4 — Protocol V2 envelope, validation, timeout, retry and cancellation. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  if (!core) return;

  const VERSION = 2;
  const pending = new Map();

  function id(prefix = 'req') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function sessionId() {
    if (!sessionId.value) sessionId.value = `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return sessionId.value;
  }

  function create(type, payload = {}, options = {}) {
    return {
      protocol: 'BINGO',
      version: VERSION,
      type: String(type || 'event'),
      id: String(options.id || id()),
      sessionId: String(options.sessionId || sessionId()),
      timestamp: Date.now(),
      tool: options.tool || payload.tool || null,
      args: payload.args ?? (payload.tool ? payload.args || {} : {}),
      payload: core.safeClone(payload),
      meta: core.safeClone(options.meta || {})
    };
  }

  function isValid(message) {
    return !!message && message.protocol === 'BINGO' && Number(message.version) === VERSION &&
      typeof message.type === 'string' && typeof message.id === 'string' &&
      typeof message.sessionId === 'string' && Number.isFinite(message.timestamp);
  }

  function errorEnvelope(request, code, message, details = null) {
    return {
      protocol: 'BINGO', version: VERSION, type: 'error',
      id: request?.id || id('err'), sessionId: request?.sessionId || sessionId(), timestamp: Date.now(),
      success: false, error: {code, message, details: core.safeClone(details)}
    };
  }

  function resultEnvelope(request, success, result = null, error = null) {
    return {
      protocol: 'BINGO', version: VERSION, type: 'tool_result',
      id: request?.id || id('result'), sessionId: request?.sessionId || sessionId(), timestamp: Date.now(),
      success: !!success, result: core.safeClone(result), error: error ? core.safeClone(error) : null
    };
  }

  async function request(send, message, options = {}) {
    const timeout = Math.max(250, Number(options.timeout || 8000));
    const retries = Math.max(0, Math.min(5, Number(options.retries ?? 2)));
    const envelope = isValid(message) ? message : create(message?.type || 'request', message?.payload || message || {}, message || {});
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (pending.has(envelope.id)) throw new Error(`Request ${envelope.id} já está em andamento.`);
      const controller = new AbortController();
      const entry = {controller, cancelled:false};
      pending.set(envelope.id, entry);
      try {
        const response = await Promise.race([
          Promise.resolve().then(() => send(envelope, controller.signal)),
          new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Timeout do protocolo BINGO.'), {code:'TIMEOUT'})), timeout))
        ]);
        if (response && response.protocol === 'BINGO' && response.id !== envelope.id) {
          throw Object.assign(new Error('Resposta BINGO com request ID diferente.'), {code:'ID_MISMATCH'});
        }
        return response;
      } catch (error) {
        lastError = error;
        if (entry.cancelled || error?.code === 'CANCELLED') break;
        if (attempt < retries) await new Promise(resolve => setTimeout(resolve, Math.min(2000, 250 * (attempt + 1))));
      } finally {
        pending.delete(envelope.id);
      }
    }
    throw lastError || new Error('Falha no protocolo BINGO.');
  }

  function cancel(requestId) {
    const entry = pending.get(requestId);
    if (!entry) return false;
    entry.cancelled = true;
    entry.controller.abort();
    pending.delete(requestId);
    return true;
  }

  function pendingRequests() { return [...pending.keys()]; }

  globalThis.BingoProtocolV2 = Object.freeze({
    version: VERSION,
    create,
    isValid,
    errorEnvelope,
    resultEnvelope,
    request,
    cancel,
    pending: pendingRequests,
    sessionId
  });
})();
