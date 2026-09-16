/* BINGO Extension Foundation — shared core utilities for Stage 1. */
(() => {
  const VERSION = '1.0.0';
  const KEY = 'bingo_extension_config';

  const defaults = {
    enabled: true,
    debug: false,
    protocolVersion: 1,
    autoReconnect: true,
    heartbeatMs: 5000
  };

  function safeClone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  }

  function log(level, message, details = null) {
    const prefix = `[BINGO Extension ${VERSION}]`;
    if (level === 'error') console.error(prefix, message, details || '');
    else if (level === 'warn') console.warn(prefix, message, details || '');
    else console.log(prefix, message, details || '');
  }

  function mergeConfig(value = {}) {
    return {...defaults, ...(value || {})};
  }

  async function getConfig() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return {...defaults};
    const data = await chrome.storage.local.get(KEY);
    return mergeConfig(data[KEY]);
  }

  async function setConfig(patch = {}) {
    const config = mergeConfig(patch);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({[KEY]: config});
    }
    return config;
  }

  globalThis.BingoExtension = Object.freeze({
    version: VERSION,
    defaults: Object.freeze({...defaults}),
    log,
    safeClone,
    mergeConfig,
    getConfig,
    setConfig
  });
})();
