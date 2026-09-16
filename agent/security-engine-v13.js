/* BINGO Extension Stage 13 — security validation, origin checks, payload limits and session isolation. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  if (!core) return;

  const VERSION = 1;
  const MAX_PAYLOAD = 512 * 1024;
  const MAX_STRING = 128 * 1024;
  const ALLOWED_ORIGINS = new Set(['https://chat.deepseek.com', 'https://www.deepseek.com']);
  const state = {version:VERSION, sessionId:null, rejected:0, accepted:0, lastError:null};

  function sessionId() {
    if (!state.sessionId) state.sessionId = `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
    return state.sessionId;
  }

  function sizeOf(value) {
    try { return new Blob([JSON.stringify(value)]).size; } catch (_) { return Infinity; }
  }

  function validateOrigin(origin = location.origin) {
    if (!ALLOWED_ORIGINS.has(String(origin))) throw Object.assign(new Error('Origem não autorizada.'), {code:'ORIGIN_DENIED'});
    return true;
  }

  function validateText(text, max = MAX_STRING) {
    if (typeof text !== 'string') throw Object.assign(new Error('Texto inválido.'), {code:'INVALID_TEXT'});
    if (text.length > max) throw Object.assign(new Error('Payload de texto excede o limite.'), {code:'PAYLOAD_TOO_LARGE'});
    return true;
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('Payload deve ser um objeto.'), {code:'INVALID_PAYLOAD'});
    if (sizeOf(payload) > MAX_PAYLOAD) throw Object.assign(new Error('Payload excede 512 KB.'), {code:'PAYLOAD_TOO_LARGE'});
    for (const value of Object.values(payload)) if (typeof value === 'string') validateText(value);
    return true;
  }

  function validateSession(id) {
    if (!id || String(id) !== sessionId()) throw Object.assign(new Error('Sessão BINGO inválida.'), {code:'SESSION_MISMATCH'});
    return true;
  }

  function validateMessage(message, options = {}) {
    try {
      validateOrigin(options.origin || location.origin);
      validatePayload(message);
      if (options.sessionId !== undefined) validateSession(options.sessionId);
      if (message.sessionId) validateSession(message.sessionId);
      state.accepted += 1;
      return {ok:true, sessionId:sessionId()};
    } catch (error) {
      state.rejected += 1;
      state.lastError = {code:error.code || 'SECURITY_REJECTED', message:error.message || String(error)};
      core.log('warn', 'Security Engine rejeitou mensagem', state.lastError);
      return {ok:false, error:state.lastError};
    }
  }

  function sanitizeText(text) {
    validateText(String(text ?? ''));
    return String(text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  }

  function status() { return {...state, allowedOrigins:[...ALLOWED_ORIGINS], maxPayload:MAX_PAYLOAD}; }

  window.BingoSecurityV13 = Object.freeze({
    version:VERSION,
    maxPayload:MAX_PAYLOAD,
    sessionId,
    validateOrigin,
    validatePayload,
    validateSession,
    validateMessage,
    sanitizeText,
    status
  });

  try { validateOrigin(); } catch (_) {}
  core.log('info', 'Security Engine V13 ativo', {maxPayload:MAX_PAYLOAD});
})();
