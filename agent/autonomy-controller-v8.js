/* BINGO Extension Stage 8 — bounded autonomy controller. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  const continuity = globalThis.BingoContinuityV7;
  if (!core || !continuity) return;

  const VERSION = 1;
  const DEFAULT_MAX_STEPS = 50;
  const MAX_STEPS = 100;
  const DEFAULT_TIMEOUT = 60000;
  const state = {
    version: VERSION,
    status: 'idle',
    goal: '',
    step: 0,
    maxSteps: DEFAULT_MAX_STEPS,
    startedAt: 0,
    updatedAt: 0,
    currentAction: '',
    lastResult: null,
    lastError: null,
    paused: false,
    cancelled: false
  };
  let timer = null;

  function get() { return core.safeClone(state); }
  function emit(reason) {
    state.updatedAt = Date.now();
    window.dispatchEvent(new CustomEvent('bingo:autonomy-updated', {detail:{...get(), reason}}));
  }
  function clearTimer() { if (timer) clearTimeout(timer); timer = null; }

  async function start(goal, maxSteps = DEFAULT_MAX_STEPS) {
    const cleanGoal = String(goal || '').trim();
    if (!cleanGoal) throw new Error('Autonomia exige um objetivo.');
    if (state.status === 'running') return get();
    state.goal = cleanGoal;
    state.step = 0;
    state.maxSteps = Math.max(1, Math.min(MAX_STEPS, Number(maxSteps) || DEFAULT_MAX_STEPS));
    state.startedAt = Date.now();
    state.currentAction = '';
    state.lastResult = null;
    state.lastError = null;
    state.paused = false;
    state.cancelled = false;
    state.status = 'running';
    await continuity.start(continuity.get().project, continuity.get().taskId || '');
    await continuity.record('autonomy.start', {currentTask:cleanGoal, currentAction:'PLAN', status:'active'});
    emit('start');
    return get();
  }

  async function step(action, executor) {
    if (state.status !== 'running' || state.paused || state.cancelled) return get();
    if (state.step >= state.maxSteps) {
      state.status = 'limit_reached';
      await continuity.checkpoint('step-limit');
      emit('limit');
      return get();
    }
    state.step += 1;
    state.currentAction = String(action || 'EXECUTE');
    await continuity.action(action || 'autonomy.step', '', state.currentAction);
    emit('step-start');
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Autonomy step timeout.'), {code:'AUTONOMY_TIMEOUT'})), DEFAULT_TIMEOUT);
      });
      const work = typeof executor === 'function' ? Promise.resolve().then(executor) : Promise.resolve({ok:true, action:state.currentAction});
      const result = await Promise.race([work, timeout]);
      clearTimer();
      state.lastResult = core.safeClone(result);
      state.lastError = null;
      await continuity.result(result);
      emit('step-result');
      if (state.step >= state.maxSteps) {
        state.status = 'limit_reached';
        await continuity.checkpoint('step-limit');
      }
    } catch (error) {
      clearTimer();
      state.lastError = {message:error?.message || String(error), code:error?.code || 'AUTONOMY_ERROR'};
      state.status = 'error';
      await continuity.error(error);
      emit('step-error');
    }
    return get();
  }

  async function pause() {
    if (state.status === 'running') {
      state.paused = true;
      state.status = 'paused';
      await continuity.checkpoint('paused');
      emit('pause');
    }
    return get();
  }

  async function resume() {
    if (!['paused','error','resumable'].includes(state.status)) return get();
    state.paused = false;
    state.cancelled = false;
    state.status = 'running';
    await continuity.resume();
    emit('resume');
    return get();
  }

  async function cancel() {
    clearTimer();
    state.cancelled = true;
    state.paused = false;
    state.status = 'cancelled';
    await continuity.checkpoint('cancelled');
    emit('cancel');
    return get();
  }

  async function stop() {
    clearTimer();
    if (state.status === 'running' || state.status === 'paused' || state.status === 'error') {
      state.status = 'stopped';
      await continuity.checkpoint('stopped');
      emit('stop');
    }
    return get();
  }

  async function recover() {
    await continuity.load();
    const saved = continuity.get();
    if (!saved.sessionId || !saved.project) return get();
    state.goal = saved.currentTask || state.goal;
    state.currentAction = saved.currentAction || '';
    state.lastResult = saved.lastResult || null;
    state.lastError = saved.lastError || null;
    state.status = saved.recovery === 'resumed' ? 'running' : 'resumable';
    state.paused = state.status !== 'running';
    emit('recover');
    return get();
  }

  window.BingoAutonomyV8 = Object.freeze({
    version:VERSION,
    state:get,
    start,
    step,
    pause,
    resume,
    cancel,
    stop,
    recover,
    constants:Object.freeze({DEFAULT_MAX_STEPS,MAX_STEPS,DEFAULT_TIMEOUT})
  });

  continuity.load().then(() => {
    if (continuity.shouldResume()) recover().catch(() => {});
  }).catch(() => {});
  core.log('info', 'Autonomy Controller V8 ativo', {maxSteps:MAX_STEPS});
})();
