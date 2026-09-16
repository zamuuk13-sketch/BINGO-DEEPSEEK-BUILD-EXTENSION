(() => {
  'use strict';

  const adapter = globalThis.BingoDeepSeekAdapterV11;
  if (!adapter) return;

  let connected = false;
  let initialized = false;
  let lastAssistant = '';
  let pollTimer = null;
  let observerCleanup = null;
  const seen = new WeakMap();

  function send(type, payload = {}) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({type, ...payload}, response => resolve(response || {ok:false}));
    });
  }

  async function connect() {
    const name = document.title || 'DeepSeek';
    const response = await send('BINGO_DESKTOP_CONNECT', {chatName:name});
    connected = !!response.ok;
    if (!initialized) {
      const last = adapter.findLatestAssistantMessage();
      lastAssistant = last ? adapter.extractMessageText(last) : '';
      for (const node of adapter.findAssistantMessages()) seen.set(node, adapter.extractMessageText(node));
      initialized = true;
    }
    return connected;
  }

  async function pollOutbound() {
    if (!connected) return;
    const response = await send('BINGO_DESKTOP_POLL');
    if (!response?.ok || !response.message?.text) return;
    const element = adapter.findComposer();
    if (!element) return;
    adapter.setComposerText(element, response.message.text);
    adapter.submitComposer(element);
  }

  function forwardAssistant(node) {
    if (!(node instanceof Element)) return;
    const text = adapter.extractMessageText(node);
    if (!text || text === lastAssistant || text === seen.get(node)) return;
    seen.set(node, text);
    clearTimeout(node.__bingoDesktopTimer);
    node.__bingoDesktopTimer = setTimeout(async () => {
      const stable = adapter.extractMessageText(node);
      if (!stable || stable === lastAssistant) return;
      lastAssistant = stable;
      await send('BINGO_DESKTOP_ASSISTANT', {text:stable});
    }, 900);
  }

  function scan() {
    if (!connected) return;
    const last = adapter.findLatestAssistantMessage();
    if (last) forwardAssistant(last);
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (observerCleanup) observerCleanup();
    observerCleanup = null;
  }

  async function start() {
    try { await connect(); } catch (_) { connected = false; }
    if (!connected) {
      setTimeout(start, 1500);
      return;
    }
    observerCleanup = adapter.observeMessages(() => scan());
    pollTimer = setInterval(() => { pollOutbound().catch(() => {}); scan(); }, 700);
    scan();
  }

  window.BingoDesktopBridgeV5 = Object.freeze({version:5, stop, reconnect:connect, state:() => ({connected, initialized})});

  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, {once:true});
})();
