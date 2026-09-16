(() => {
  'use strict';

  // V11.3 performance sanitizer.
  // Transport results are hidden, but we avoid scanning the entire DeepSeek DOM
  // on every mutation. Only newly-added/changed nodes are inspected.
  const MARKERS = ['===BINGO_RESULT===', '===BINGO_END_RESULT==='];
  const STYLE_ID = 'bingo-v11-transport-style';
  const HIDDEN = 'bingo-v11-hidden-transport';
  let scheduled = false;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `.${HIDDEN}{display:none!important;}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function isTransportText(text) {
    if (!text) return false;
    return text.includes(MARKERS[0]) || text.includes(MARKERS[1]);
  }

  function hideMessage(node) {
    if (!(node instanceof Element) || !isTransportText(node.textContent || '')) return false;

    // Prefer the actual user bubble. Do not walk/search the whole document.
    let target = node.closest('[data-message-author-role="user"], [data-role="user"]');
    if (!target) target = node.closest('div.group');
    if (!target) target = node;

    if (!target.classList.contains(HIDDEN)) {
      target.classList.add(HIDDEN);
      target.setAttribute('data-bingo-v11-transport', 'hidden');
    }
    return true;
  }

  function scanNode(node) {
    if (!(node instanceof Element)) return;
    if (hideMessage(node)) return;

    // Inspect only descendants that are likely message/content nodes.
    const candidates = node.querySelectorAll?.('[data-message-author-role="user"], [data-role="user"], .ds-markdown, div.group');
    for (const child of candidates || []) {
      if (isTransportText(child.textContent || '')) hideMessage(child);
    }
  }

  function scheduleScan(node) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scanNode(node || document.body);
    });
  }

  function start() {
    installStyle();
    scanNode(document.body);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          if (parent && isTransportText(mutation.target.data || '')) hideMessage(parent);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Do not recursively traverse the complete page.
            scheduleScan(node);
          }
        }
      }
    });

    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
    window.BingoV11Transport = { version: 2, scan: () => scanNode(document.body) };
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, {once:true});
})();
