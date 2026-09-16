/* BINGO Extension Stage 4/13 — Protocol V2 with security validation. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  if (!core) return;

  const VERSION = 2;
  const pending = new Map();
  const MAX_PAYLOAD = 512 * 1024;

  function id(prefix = 'req') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`; }
  function sessionId() {
    if (!sessionId.value) sessionId.value = `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    return sessionId.value;
  }
  function payloadSize(value) {
    try { return new Blob([JSON.stringify(value)]).size; } catch (_) { return Infinity; }
  }
  function secure(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw Object.assign(new Error('Mensagem BINGO inválida.'), {code:'INVALID_MESSAGE'});
    if (message.protocol !== 'BINGO' || Number(message.version) !== VERSION) throw Object.assign(new Error('Versão do protocolo não autorizada.'), {code:'PROTOCOL_VERSION'});
    if (typeof message.id !== 'string' || !message.id || typeof message.sessionId !== 'string' || !message.sessionId) throw Object.assign(new Error('Identidade da mensagem inválida.'), {code:'INVALID_IDENTITY'});
    if (message.sessionId !== sessionId()) throw Object.assign(new Error('Sessão BINGO incompatível.'), {code:'SESSION_MISMATCH'});
    if (!Number.isFinite(message.timestamp) || Math.abs(Date.now() - message.timestamp) > 10 * 60 * 1000) throw Object.assign(new Error('Timestamp da mensagem expirado.'), {code:'STALE_MESSAGE'});
    if (payloadSize(message) > MAX_PAYLOAD) throw Object.assign(new Error('Mensagem excede 512 KB.'), {code:'PAYLOAD_TOO_LARGE'});
    return true;
  }
  function create(type, payload = {}, options = {}) {
    return {protocol:'BINGO',version:VERSION,type:String(type || 'event'),id:String(options.id || id()),sessionId:String(options.sessionId || sessionId()),timestamp:Date.now(),tool:options.tool || payload.tool || null,args:payload.args ?? (payload.tool ? payload.args || {} : {}),payload:core.safeClone(payload),meta:core.safeClone(options.meta || {})};
  }
  function isValid(message) { try { secure(message); return true; } catch (_) { return false; } }
  function errorEnvelope(request, code, message, details = null) { return {protocol:'BINGO',version:VERSION,type:'error',id:request?.id || id('err'),sessionId:request?.sessionId || sessionId(),timestamp:Date.now(),success:false,error:{code,message,details:core.safeClone(details)}}; }
  function resultEnvelope(request, success, result = null, error = null) { return {protocol:'BINGO',version:VERSION,type:'tool_result',id:request?.id || id('result'),sessionId:request?.sessionId || sessionId(),timestamp:Date.now(),success:!!success,result:core.safeClone(result),error:error ? core.safeClone(error) : null}; }

  async function request(send, message, options = {}) {
    const timeout = Math.max(250, Number(options.timeout || 8000));
    const retries = Math.max(0, Math.min(5, Number(options.retries ?? 2)));
    const envelope = isValid(message) ? message : create(message?.type || 'request', message?.payload || message || {}, message || {});
    secure(envelope);
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (pending.has(envelope.id)) throw new Error(`Request ${envelope.id} já está em andamento.`);
      const controller = new AbortController();
      const entry = {controller,cancelled:false};
      pending.set(envelope.id, entry);
      try {
        const response = await Promise.race([Promise.resolve().then(() => send(envelope, controller.signal)),new Promise((_,reject) => setTimeout(() => reject(Object.assign(new Error('Timeout do protocolo BINGO.'),{code:'TIMEOUT'})),timeout))]);
        if (response && response.protocol === 'BINGO') secure(response);
        if (response && response.protocol === 'BINGO' && response.id !== envelope.id) throw Object.assign(new Error('Resposta BINGO com request ID diferente.'),{code:'ID_MISMATCH'});
        return response;
      } catch (error) {
        lastError = error;
        if (entry.cancelled || error?.code === 'CANCELLED') break;
        if (attempt < retries) await new Promise(resolve => setTimeout(resolve,Math.min(2000,250 * (attempt + 1))));
      } finally { pending.delete(envelope.id); }
    }
    throw lastError || new Error('Falha no protocolo BINGO.');
  }
  function cancel(requestId) { const entry=pending.get(requestId); if(!entry)return false; entry.cancelled=true; entry.controller.abort(); pending.delete(requestId); return true; }
  function pendingRequests() { return [...pending.keys()]; }

  globalThis.BingoProtocolV2 = Object.freeze({version:VERSION,create,isValid,errorEnvelope,resultEnvelope,request,cancel,pending:pendingRequests,sessionId,secure});
})();
