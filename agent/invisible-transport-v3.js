/* BINGO Extension Stage 3 — invisible transport and DOM-safe message filtering. */
(() => {
  'use strict';
  const core = globalThis.BingoExtension;
  if (!core) return;

  const INTERNAL_PATTERNS = [
    /===BINGO_(?:TOOL|RESULT|END_TOOL|END_RESULT|READY)===/i,
    /"protocol"\s*:\s*"BINGO"/i,
    /"type"\s*:\s*"(?:tool_request|tool_result|internal_context)"/i
  ];

  const state = {
    hidden: 0,
    stripped: 0,
    lastScan: 0,
    running: true
  };

  function isInternalText(text) {
    return INTERNAL_PATTERNS.some(pattern => pattern.test(text || ''));
  }

  function hideNode(node) {
    if (!(node instanceof Element)) return false;
    if (node.dataset.bingoTransportHidden === '1') return false;
    node.dataset.bingoTransportHidden = '1';
    node.classList.add('bingo-v3-hidden-transport');
    state.hidden += 1;
    return true;
  }

  function sanitizeElement(element) {
    if (!(element instanceof Element)) return;
    const text = (element.innerText || element.textContent || '').trim();
    if (!text || !isInternalText(text)) return;

    const role = element.getAttribute('data-message-author-role') || element.getAttribute('data-role');
    const markdown = element.matches('.ds-markdown') || !!element.querySelector('.ds-markdown');
    if (role === 'assistant' || markdown || element.matches('.ds-markdown')) hideNode(element.closest('[data-message-author-role="assistant"],[data-role="assistant"]') || element);
  }

  function scan(root = document) {
    if (!state.running) return;
    const candidates = root.querySelectorAll
      ? root.querySelectorAll('[data-message-author-role="assistant"],[data-role="assistant"],.ds-markdown')
      : [];
    for (const element of candidates) sanitizeElement(element);
    state.lastScan = Date.now();
  }

  const style = document.createElement('style');
  style.id = 'bingo-v3-invisible-transport';
  style.textContent = '.bingo-v3-hidden-transport{display:none!important;visibility:hidden!important;height:0!important;max-height:0!important;overflow:hidden!important;pointer-events:none!important;}';
  (document.head || document.documentElement).appendChild(style);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        sanitizeElement(mutation.target.parentElement);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) sanitizeElement(node);
      }
    }
  });

  function init() {
    scan();
    if (document.body) observer.observe(document.body, {childList:true, subtree:true, characterData:true});
    core.log('info', 'Invisible Transport V3 ativo');
  }

  window.BingoInvisibleTransport = Object.freeze({
    version: 3,
    state: () => ({...state}),
    isInternalText,
    scan
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
