/* BINGO Extension Stage 15 — production lifecycle, migration, compatibility and safe fallback. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  if (!core) return;

  const VERSION = 1;
  const PRODUCT_VERSION = '2.15.0';
  const STORAGE_KEY = 'bingo_extension_production_v15';
  const CONFIG_KEY = 'bingo_extension_config';
  const MIN_PROTOCOL = 2;
  const state = {
    version: VERSION,
    productVersion: PRODUCT_VERSION,
    mode: 'normal',
    initialized: false,
    compatible: true,
    lastMigration: null,
    lastError: null,
    updatedAt: Date.now()
  };

  const defaults = {
    enabled: true,
    debug: false,
    protocolVersion: 2,
    autoReconnect: true,
    heartbeatMs: 5000,
    production: {safeFallback: true, diagnostics: true, autoMigrate: true}
  };

  function clone(value) {
    return core.safeClone(value);
  }

  async function storageGet(key) {
    const data = await chrome.storage.local.get(key);
    return data?.[key];
  }

  async function storageSet(key, value) {
    await chrome.storage.local.set({[key]: clone(value)});
  }

  function mergeConfig(saved) {
    const value = saved && typeof saved === 'object' ? saved : {};
    return {...defaults, ...value, production:{...defaults.production, ...(value.production || {})}};
  }

  async function backupConfig(config) {
    const backup = {savedAt:Date.now(), productVersion:PRODUCT_VERSION, config:clone(config)};
    await storageSet('bingo_extension_config_backup_v15', backup);
    return backup;
  }

  async function migrate() {
    const current = await storageGet(CONFIG_KEY);
    const config = mergeConfig(current);
    const previousProtocol = Number(current?.protocolVersion || 1);
    const needsMigration = !current || previousProtocol < MIN_PROTOCOL || !current.production;
    if (!needsMigration) return {migrated:false, config};
    await backupConfig(current || {});
    config.protocolVersion = Math.max(MIN_PROTOCOL, Number(config.protocolVersion) || MIN_PROTOCOL);
    await storageSet(CONFIG_KEY, config);
    const migration = {at:Date.now(), fromProtocol:previousProtocol, toProtocol:config.protocolVersion};
    state.lastMigration = migration;
    await storageSet(STORAGE_KEY, {...state, configVersion:config.protocolVersion});
    return {migrated:true, config, migration};
  }

  function compatibility() {
    const protocol = Number(globalThis.BingoProtocolV2?.version || 0);
    const engines = {
      security: !!globalThis.BingoSecurityV13,
      adapter: !!globalThis.BingoDeepSeekAdapterV11,
      continuity: !!globalThis.BingoContinuityV7,
      autonomy: !!globalThis.BingoAutonomyV8,
      transport: !!globalThis.BingoMultiTransportV10,
      performance: !!globalThis.BingoPerformanceV12,
      diagnostics: !!globalThis.BingoDiagnosticsV14
    };
    const missing = Object.entries(engines).filter(([,ok]) => !ok).map(([name]) => name);
    return {ok:protocol >= MIN_PROTOCOL && missing.length === 0, protocol, requiredProtocol:MIN_PROTOCOL, engines, missing};
  }

  function enterSafeMode(reason) {
    state.mode = 'safe';
    state.compatible = false;
    state.lastError = {code:'SAFE_FALLBACK', reason:String(reason || 'compatibility failure')};
    state.updatedAt = Date.now();
    try { window.dispatchEvent(new CustomEvent('bingo:production-safe-mode', {detail:clone(state)})); } catch (_) {}
    core.log('warn', 'BINGO entrou em Safe Fallback', state.lastError);
    return status();
  }

  function status() {
    return clone({...state, compatibility:compatibility()});
  }

  async function initialize() {
    try {
      const migration = await migrate();
      const check = compatibility();
      state.compatible = check.ok;
      state.initialized = true;
      state.mode = check.ok ? 'normal' : 'safe';
      state.updatedAt = Date.now();
      if (!check.ok) enterSafeMode(`Componentes incompatíveis/ausentes: ${check.missing.join(', ') || 'Protocol V2'}`);
      else if (migration.migrated) core.log('info', 'BINGO config migrada', migration.migration);
      await storageSet(STORAGE_KEY, state);
      window.dispatchEvent(new CustomEvent('bingo:production-ready', {detail:status()}));
      return status();
    } catch (error) {
      state.lastError = {code:'PRODUCTION_INIT_FAILED', message:error?.message || String(error)};
      state.mode = 'safe';
      state.compatible = false;
      state.initialized = true;
      try { await storageSet(STORAGE_KEY, state); } catch (_) {}
      core.log('error', 'Falha na inicialização Production V15', state.lastError);
      return status();
    }
  }

  async function restoreBackup() {
    const backup = await storageGet('bingo_extension_config_backup_v15');
    if (!backup?.config) throw new Error('Nenhum backup de configuração disponível.');
    await storageSet(CONFIG_KEY, mergeConfig(backup.config));
    state.lastMigration = {restoredAt:Date.now(), source:backup.savedAt};
    await storageSet(STORAGE_KEY, state);
    return mergeConfig(backup.config);
  }

  window.BingoProductionV15 = Object.freeze({
    version:VERSION,
    productVersion:PRODUCT_VERSION,
    status,
    initialize,
    migrate,
    compatibility,
    enterSafeMode,
    restoreBackup
  });

  initialize();
})();
