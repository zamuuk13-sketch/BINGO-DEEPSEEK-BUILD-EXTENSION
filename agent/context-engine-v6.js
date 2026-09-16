/* BINGO Extension Stage 6 — compact project context engine. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  const protocol = globalThis.BingoProtocolV2;
  if (!core || !protocol) return;

  const VERSION = 1;
  const state = {
    project: '',
    engine: 'unknown',
    os: 'Windows',
    python: '',
    compiler: '',
    currentFile: '',
    currentTask: '',
    scan: null,
    environment: null,
    plan: null,
    diagnostics: [],
    updatedAt: 0
  };

  const listeners = new Set();
  let refreshTimer = null;

  function emit(reason = 'update') {
    state.updatedAt = Date.now();
    const snapshot = get();
    for (const listener of listeners) {
      try { listener(snapshot, reason); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('bingo:context-updated', {detail:{...snapshot, reason}}));
  }

  function set(patch = {}, reason = 'set') {
    Object.assign(state, core.safeClone(patch));
    emit(reason);
    return get();
  }

  function get() {
    return core.safeClone({version:VERSION, ...state});
  }

  function compact(value, max = 1200) {
    if (value == null) return null;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function summarizeScan(result) {
    const data = result?.result || result || {};
    const files = Array.isArray(data.files) ? data.files : [];
    const languages = data.languages || {};
    const lower = files.map(file => String(file.path || file.name || file).toLowerCase());
    let engine = 'unknown';
    if (lower.some(p => p.endsWith('.godot') || p.includes('project.godot'))) engine = 'Godot';
    else if (lower.some(p => p.includes('package.json'))) engine = 'Node.js';
    else if (lower.some(p => p.endsWith('.csproj') || p.endsWith('.sln'))) engine = '.NET';
    else if (lower.some(p => p.endsWith('.uproject'))) engine = 'Unreal Engine';
    else if (lower.some(p => p.endsWith('.lua'))) engine = 'Lua';
    return {fileCount:files.length, languages, engine, files:files.slice(0,80).map(f => typeof f === 'string' ? f : f.path || f.name)};
  }

  function summarizeEnvironment(result) {
    const data = result?.result || result || {};
    const text = JSON.stringify(data).toLowerCase();
    const find = (patterns) => patterns.find(([pattern]) => text.includes(pattern))?.[1] || '';
    return {
      python: find([['python','Python'],['py -3','Python']]),
      compiler: find([['mingw','MinGW'],['gcc','GCC'],['g++','G++'],['clang','Clang'],['msvc','MSVC']]),
      os: data.os || data.platform || 'Windows'
    };
  }

  async function tool(tool, args, options = {}) {
    const request = protocol.create('context_request', {tool, args}, {tool, meta:{source:'context-engine-v6'}});
    request.tool = tool;
    request.args = core.safeClone(args);
    request.payload = {tool, args:core.safeClone(args)};
    return protocol.request((envelope) => new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({type:'BINGO_PROTOCOL_V2', message:envelope}, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error?.message || 'Context Tool falhou.'));
        resolve(response.message || response);
      });
    }), request, options);
  }

  async function refresh(project = state.project, options = {}) {
    if (!project) return get();
    state.project = project;
    try {
      const [scan, environment, plan, runtime] = await Promise.all([
        tool('project.scan', {project}, options),
        tool('env.inspect', {project}, options).catch(() => null),
        tool('agent.plan.read', {project}, options).catch(() => null),
        tool('agent.runtime.status', {project}, options).catch(() => null)
      ]);
      state.scan = summarizeScan(scan);
      state.engine = state.scan.engine;
      if (environment) Object.assign(state, summarizeEnvironment(environment));
      state.plan = compact(plan?.result?.plan || plan?.result || plan, 2400);
      const runtimeData = runtime?.result || runtime || {};
      state.currentTask = runtimeData.currentTask || runtimeData.goal || state.currentTask;
      state.diagnostics = Array.isArray(runtimeData.diagnostics) ? runtimeData.diagnostics.slice(-5) : state.diagnostics;
      emit('refresh');
    } catch (error) {
      core.log('warn', 'Context Engine refresh falhou', {error:error?.message || String(error)});
    }
    return get();
  }

  function setCurrentFile(file) { state.currentFile = String(file || ''); emit('current-file'); }
  function setCurrentTask(task) { state.currentTask = String(task || ''); emit('current-task'); }
  function scheduleRefresh(project = state.project, delay = 800) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh(project).catch(() => {}), Math.max(100, delay));
  }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

  function promptContext(max = 3500) {
    const lines = [
      `Workspace: ${state.project || '(nenhum)'}`,
      `Engine: ${state.engine || 'unknown'}`,
      `OS: ${state.os || 'unknown'}`,
      `Python: ${state.python || 'unknown'}`,
      `Compiler: ${state.compiler || 'unknown'}`,
      `Current file: ${state.currentFile || '(nenhum)'}`,
      `Current task: ${state.currentTask || '(nenhuma)'}`
    ];
    if (state.scan?.fileCount != null) lines.push(`Project files: ${state.scan.fileCount}`);
    if (state.plan) lines.push(`Plan: ${compact(state.plan, 1000)}`);
    return lines.join('\n').slice(0, max);
  }

  window.BingoContextEngineV6 = Object.freeze({
    version: VERSION,
    state:get,
    set,
    refresh,
    setCurrentFile,
    setCurrentTask,
    scheduleRefresh,
    subscribe,
    promptContext
  });

  core.log('info', 'Context Engine V6 ativo');
})();
