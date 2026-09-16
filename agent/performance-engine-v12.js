/* BINGO Extension Stage 12 — DOM performance, batching, debounce and cleanup. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  const adapter = globalThis.BingoDeepSeekAdapterV11;
  if (!core || !adapter) return;

  const VERSION = 1;
  const DEFAULT_DEBOUNCE = 120;
  const DEFAULT_SCAN_INTERVAL = 700;
  const MAX_QUEUE = 40;

  const state = {
    version: VERSION,
    running: false,
    scans: 0,
    mutations: 0,
    queued: 0,
    dropped: 0,
    lastScan: 0,
    lastMutation: 0,
    lastAssistantCount: 0
  };

  let observerCleanup = null;
  let debounceTimer = null;
  let intervalTimer = null;
  let scanQueued = false;
  const callbacks = new Set();
  const seenTexts = new WeakMap();

  function emit(reason) {
    const detail = {...state, reason};
    window.dispatchEvent(new CustomEvent('bingo:performance-updated', {detail}));
    for (const callback of callbacks) {
      try { callback(detail); } catch (_) {}
    }
  }

  function scheduleScan(reason = 'mutation', delay = DEFAULT_DEBOUNCE) {
    state.queued += 1;
    if (state.queued > MAX_QUEUE) {
      state.queued = MAX_QUEUE;
      state.dropped += 1;
    }
    if (scanQueued) return;
    scanQueued = true;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      scanQueued = false;
      state.queued = 0;
      scan(reason);
    }, Math.max(0, delay));
  }

  function scan(reason = 'scan') {
    if (!state.running) return;
    const latest = adapter.findLatestAssistantMessage();
    const count = adapter.findAssistantMessages().length;
    state.scans += 1;
    state.lastScan = Date.now();
    state.lastAssistantCount = count;
    if (latest) {
      const text = adapter.extractMessageText(latest);
      if (text) seenTexts.set(latest, text);
    }
    emit(reason);
  }

  function observeMutationBatch(mutations) {
    if (!state.running) return;
    state.mutations += mutations.length;
    state.lastMutation = Date.now();
    scheduleScan('mutation');
  }

  function start(options = {}) {
    if (state.running) return status();
    state.running = true;
    const debounce = Number(options.debounceMs || DEFAULT_DEBOUNCE);
    const interval = Number(options.scanIntervalMs || DEFAULT_SCAN_INTERVAL);
    observerCleanup = adapter.observeMessages(observeMutationBatch);
    intervalTimer = setInterval(() => scheduleScan('interval', debounce), Math.max(250, interval));
    scan('start');
    core.log('info', 'Performance Engine V12 ativo', {debounce, interval});
    return status();
  }

  function stop() {
    state.running = false;
    clearTimeout(debounceTimer);
    clearInterval(intervalTimer);
    debounceTimer = null;
    intervalTimer = null;
    scanQueued = false;
    state.queued = 0;
    if (observerCleanup) observerCleanup();
    observerCleanup = null;
    emit('stop');
    return status();
  }

  function status() { return {...state}; }
  function subscribe(callback) { callbacks.add(callback); return () => callbacks.delete(callback); }
  function resetMetrics() {
    state.scans = 0;
    state.mutations = 0;
    state.queued = 0;
    state.dropped = 0;
    state.lastScan = 0;
    state.lastMutation = 0;
    emit('reset');
  }

  window.BingoPerformanceV12 = Object.freeze({
    version: VERSION,
    start,
    stop,
    status,
    subscribe,
    resetMetrics,
    constants: Object.freeze({DEFAULT_DEBOUNCE, DEFAULT_SCAN_INTERVAL, MAX_QUEUE})
  });

  start();
})();
