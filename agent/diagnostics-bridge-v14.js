/* BINGO Extension Stage 14 — message bridge for the diagnostics page. */
(() => {
  'use strict';
  const diagnostics = globalThis.BingoDiagnosticsV14;
  if (!diagnostics) return;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.type?.startsWith('BINGO_DIAGNOSTICS_')) return;
    try {
      if (msg.type === 'BINGO_DIAGNOSTICS_SNAPSHOT') return sendResponse({ok:true, snapshot:diagnostics.snapshot()});
      if (msg.type === 'BINGO_DIAGNOSTICS_CLEAR') return sendResponse({ok:true, snapshot:diagnostics.clear()});
      if (msg.type === 'BINGO_DIAGNOSTICS_EXPORT') return sendResponse({ok:true, filename:diagnostics.export()});
      if (msg.type === 'BINGO_DIAGNOSTICS_TEST') return diagnostics.connectionTest().then(result => sendResponse({ok:true,result})).catch(error => sendResponse({ok:false,error:error.message || String(error)})), true;
      sendResponse({ok:false,error:'Comando de diagnostics desconhecido.'});
    } catch (error) {
      sendResponse({ok:false,error:error.message || String(error)});
    }
    return true;
  });
})();
