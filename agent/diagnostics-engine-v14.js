/* BINGO Extension Stage 14 — diagnostics, metrics, event history and safe export. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  if (!core) return;

  const VERSION = 1;
  const MAX_EVENTS = 250;
  const MAX_ERRORS = 80;
  const state = {
    version: VERSION,
    startedAt: Date.now(),
    deepseek: 'unknown',
    desktop: 'unknown',
    protocol: 'V2',
    sessionId: null,
    requests: 0,
    successful: 0,
    failed: 0,
    retries: 0,
    latencyTotal: 0,
    latencySamples: 0,
    errors: [],
    events: [],
    lastEvent: null,
    lastError: null,
    updatedAt: Date.now()
  };

  const pending = new Map();

  function now() { return Date.now(); }
  function clean(value, max = 1200) {
    if (value == null) return null;
    try {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      return text.length > max ? `${text.slice(0, max)}…` : text;
    } catch (_) { return '[unserializable]'; }
  }

  function record(type, data = {}) {
    const item = {at: now(), type: String(type), data: clean(data)};
    state.events.push(item);
    if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
    state.lastEvent = item;
    state.updatedAt = now();
    window.dispatchEvent(new CustomEvent('bingo:diagnostics-updated', {detail: snapshot()}));
    return item;
  }

  function error(code, message, details = null) {
    const item = {at:now(), code:String(code || 'UNKNOWN'), message:String(message || 'Erro'), details:clean(details)};
    state.errors.push(item);
    if (state.errors.length > MAX_ERRORS) state.errors.splice(0, state.errors.length - MAX_ERRORS);
    state.lastError = item;
    record('error', {code:item.code, message:item.message});
    return item;
  }

  function requestStart(id, meta = {}) {
    const requestId = String(id || `diag_${now()}_${Math.random().toString(16).slice(2)}`);
    pending.set(requestId, now());
    state.requests += 1;
    record('request.start', {id:requestId, type:meta.type || '', tool:meta.tool || ''});
    return requestId;
  }

  function requestEnd(id, success = true, meta = {}) {
    const requestId = String(id || '');
    const started = pending.get(requestId);
    pending.delete(requestId);
    if (started) {
      state.latencyTotal += Math.max(0, now() - started);
      state.latencySamples += 1;
    }
    if (success) state.successful += 1; else state.failed += 1;
    record('request.end', {id:requestId, success:!!success, code:meta.code || ''});
  }

  function retry(id, attempt = 0) {
    state.retries += 1;
    record('request.retry', {id:String(id || ''), attempt:Number(attempt) || 0});
  }

  function setSession(sessionId) {
    if (sessionId) state.sessionId = String(sessionId);
    record('session', {sessionId:state.sessionId});
  }

  function snapshot() {
    const performance = window.BingoPerformanceV12?.status?.() || null;
    const security = window.BingoSecurityV13?.status?.() || null;
    const continuity = window.BingoContinuityV7?.get?.() || null;
    const autonomy = window.BingoAutonomyV8?.state?.() || null;
    const transport = window.BingoMultiTransportV10?.status?.() || null;
    const bridge = window.BingoDeepSeekBridge?.status ? null : null;
    const avgLatency = state.latencySamples ? Math.round(state.latencyTotal / state.latencySamples) : 0;
    return {
      version: VERSION,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      deepseek: state.deepseek,
      desktop: state.desktop,
      protocol: state.protocol,
      sessionId: state.sessionId,
      requests: state.requests,
      successful: state.successful,
      failed: state.failed,
      retries: state.retries,
      latencyMs: avgLatency,
      pending: pending.size,
      performance,
      security,
      continuity: continuity ? {sessionId:continuity.sessionId, taskId:continuity.taskId, status:continuity.status, recovery:continuity.recovery, lastTool:continuity.lastTool} : null,
      autonomy: autonomy ? {status:autonomy.status, step:autonomy.step, maxSteps:autonomy.maxSteps, goal:clean(autonomy.goal, 500)} : null,
      transport,
      errors: state.errors.slice(-20),
      recentEvents: state.events.slice(-30)
    };
  }

  function setConnection(kind, status, details = {}) {
    const value = String(status || 'unknown');
    if (kind === 'deepseek') state.deepseek = value;
    if (kind === 'desktop') state.desktop = value;
    record(`connection.${kind}`, {status:value, details:clean(details, 500)});
  }

  function clear() {
    state.requests = 0;
    state.successful = 0;
    state.failed = 0;
    state.retries = 0;
    state.latencyTotal = 0;
    state.latencySamples = 0;
    state.errors = [];
    state.events = [];
    state.lastEvent = null;
    state.lastError = null;
    pending.clear();
    state.updatedAt = now();
    record('diagnostics.clear');
    return snapshot();
  }

  function exportData() {
    const data = snapshot();
    const payload = JSON.stringify({bingoDiagnostics:true, version:VERSION, generatedAt:now(), diagnostics:data}, null, 2);
    const blob = new Blob([payload], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const filename = `bingo-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const done = () => setTimeout(() => URL.revokeObjectURL(url), 5000);
    if (chrome.downloads?.download) {
      chrome.downloads.download({url, filename, saveAs:true}, () => done());
      return filename;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    done();
    return filename;
  }

  function connectionTest() {
    const started = now();
    return Promise.allSettled([
      fetch('http://127.0.0.1:8766/status').then(r => r.ok).catch(() => false),
      Promise.resolve(!!window.BingoDeepSeekAdapterV11?.detectPage?.())
    ]).then(results => {
      const desktop = results[0].value;
      const deepseek = results[1].value;
      setConnection('desktop', desktop ? 'connected' : 'disconnected');
      setConnection('deepseek', deepseek ? 'connected' : 'disconnected');
      record('connection.test', {desktop, deepseek, latencyMs:now() - started});
      return {desktop, deepseek, latencyMs:now() - started};
    });
  }

  window.addEventListener('bingo:bridge-status', event => {
    const detail = event.detail || {};
    setConnection('desktop', detail.status === 'connected' ? 'connected' : detail.status || 'unknown', {connectionId:detail.connectionId || null});
  });
  window.addEventListener('bingo:transport-status', event => record('transport', {connected:!!event.detail?.connected, active:event.detail?.active || null, reason:event.detail?.reason || ''}));
  window.addEventListener('bingo:performance-updated', event => record('performance', {scans:event.detail?.scans || 0, mutations:event.detail?.mutations || 0, dropped:event.detail?.dropped || 0}));
  window.addEventListener('bingo:continuity-updated', event => {
    const detail = event.detail || {};
    if (detail.sessionId) setSession(detail.sessionId);
    record('continuity', {status:detail.status || '', recovery:detail.recovery || ''});
  });
  window.addEventListener('bingo:autonomy-updated', event => record('autonomy', {status:event.detail?.status || '', step:event.detail?.step || 0, reason:event.detail?.reason || ''}));
  window.addEventListener('bingo:permission-updated', event => record('permission', {connected:!!event.detail?.connected, pending:Array.isArray(event.detail?.pending) ? event.detail.pending.length : 0}));

  window.BingoDiagnosticsV14 = Object.freeze({
    version:VERSION,
    snapshot,
    record,
    error,
    requestStart,
    requestEnd,
    retry,
    setSession,
    setConnection,
    clear,
    export:exportData,
    connectionTest
  });

  record('diagnostics.start', {version:VERSION});
  core.log('info', 'Diagnostics Engine V14 ativo', {version:VERSION});
})();
