/* BINGO Extension Stage 7 — durable agent continuity and recovery state. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  if (!core) return;

  const VERSION = 1;
  const STORAGE_KEY = 'bingo_agent_continuity_v7';
  const MAX_EVENTS = 80;

  const state = {
    version: VERSION,
    sessionId: null,
    taskId: null,
    project: '',
    currentAction: '',
    currentFile: '',
    currentTask: '',
    lastTool: '',
    lastRequestId: '',
    lastResult: null,
    lastError: null,
    status: 'idle',
    recovery: 'none',
    startedAt: 0,
    updatedAt: 0,
    events: []
  };

  function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async function load() {
    if (!chrome.storage?.local) return get();
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const saved = data?.[STORAGE_KEY];
    if (!saved) return get();
    Object.assign(state, core.safeClone(saved));
    if (!Array.isArray(state.events)) state.events = [];
    return get();
  }

  async function save() {
    state.updatedAt = Date.now();
    state.events = state.events.slice(-MAX_EVENTS);
    if (chrome.storage?.local) await chrome.storage.local.set({[STORAGE_KEY]: core.safeClone(state)});
    window.dispatchEvent(new CustomEvent('bingo:continuity-updated', {detail:get()}));
    return get();
  }

  function get() { return core.safeClone(state); }

  async function start(project = '', taskId = '') {
    state.sessionId = state.sessionId || makeId('session');
    state.taskId = taskId || state.taskId || makeId('task');
    state.project = String(project || state.project || '');
    state.startedAt = state.startedAt || Date.now();
    state.status = 'active';
    state.recovery = 'none';
    return record('session.start', {project:state.project, taskId:state.taskId});
  }

  async function record(type, data = {}) {
    state.events.push({at:Date.now(), type, data:core.safeClone(data)});
    Object.assign(state, data);
    return save();
  }

  async function action(tool, requestId, action = '') {
    return record('action', {lastTool:String(tool || ''), lastRequestId:String(requestId || ''), currentAction:String(action || tool || '')});
  }

  async function result(result, requestId = '') {
    return record('result', {lastResult:core.safeClone(result), lastRequestId:String(requestId || state.lastRequestId), lastError:null});
  }

  async function error(error, requestId = '') {
    const data = {message:error?.message || String(error || 'Erro'), code:error?.code || 'UNKNOWN'};
    return record('error', {lastError:data, lastRequestId:String(requestId || state.lastRequestId), status:'error'});
  }

  async function setContext(patch = {}) { return record('context', patch); }

  async function checkpoint(reason = 'checkpoint') {
    state.recovery = reason;
    state.status = 'paused';
    return record('checkpoint', {recovery:reason, status:'paused'});
  }

  async function resume() {
    await load();
    if (!state.sessionId) return start(state.project, state.taskId);
    state.status = 'resumed';
    state.recovery = 'resumed';
    return record('session.resume', {status:'resumed'});
  }

  async function clear() {
    Object.assign(state, {
      sessionId:null, taskId:null, project:'', currentAction:'', currentFile:'', currentTask:'',
      lastTool:'', lastRequestId:'', lastResult:null, lastError:null, status:'idle', recovery:'none',
      startedAt:0, updatedAt:Date.now(), events:[]
    });
    if (chrome.storage?.local) await chrome.storage.local.remove(STORAGE_KEY);
    return get();
  }

  function shouldResume() {
    return !!state.sessionId && !!state.project && ['active','paused','error','resumed'].includes(state.status);
  }

  window.BingoContinuityV7 = Object.freeze({
    version:VERSION,
    load,
    save,
    get,
    start,
    record,
    action,
    result,
    error,
    setContext,
    checkpoint,
    resume,
    clear,
    shouldResume
  });

  load().then(() => core.log('info', 'Agent Continuity V7 carregado', {sessionId:state.sessionId, recovery:state.recovery})).catch(error => core.log('warn', 'Falha ao carregar continuidade V7', {error:error?.message || String(error)}));
})();
