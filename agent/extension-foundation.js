/* BINGO Extension Foundation — DeepSeek page detector and lifecycle state. */
(() => {
  const core = globalThis.BingoExtension;
  if (!core) return;

  const state = {
    page: 'unknown',
    ready: false,
    lastChange: Date.now()
  };

  function isDeepSeekPage() {
    return /(^|\.)deepseek\.com$/i.test(location.hostname);
  }

  function update() {
    state.page = isDeepSeekPage() ? 'deepseek' : 'unknown';
    state.ready = state.page === 'deepseek' && document.readyState !== 'loading';
    state.lastChange = Date.now();
    document.documentElement.dataset.bingoExtension = state.ready ? 'ready' : 'loading';
  }

  function snapshot() {
    return {
      version: core.version,
      ...state,
      url: location.href.split('#')[0]
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'BINGO_EXTENSION_STATUS') return;
    sendResponse({ok: true, status: snapshot()});
    return true;
  });

  document.addEventListener('readystatechange', update, {passive: true});
  window.addEventListener('pageshow', update, {passive: true});
  update();
  core.log('info', 'Foundation inicializada', snapshot());
})();
