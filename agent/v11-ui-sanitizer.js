(() => {
  'use strict';

  // Keeps the BINGO transport protocol out of the visible DeepSeek conversation.
  // The protocol messages are still real chat messages, so DeepSeek receives them,
  // but the user never has to see the internal JSON transport.
  const MARKERS = ['===BINGO_RESULT===', '===BINGO_END_RESULT==='];
  const STYLE_ID = 'bingo-v11-transport-style';

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.bingo-v11-hidden-transport{display:none!important;}';
    (document.head || document.documentElement).appendChild(style);
  }

  function containsProtocol(node) {
    const text = node?.textContent || '';
    return MARKERS.some(marker => text.includes(marker));
  }

  function hideMessage(node) {
    if (!(node instanceof Element)) return;
    if (!containsProtocol(node)) return;

    let target = node.closest('[data-message-author-role="user"], [data-role="user"]');
    if (!target) {
      target = node.closest('div.group, div[class*="message"], div[class*="chat"]') || node;
    }
    target.classList.add('bingo-v11-hidden-transport');
    target.setAttribute('data-bingo-v11-transport', 'hidden');
  }

  function scan(root = document.body) {
    if (!root) return;
    installStyle();
    if (root instanceof Element && containsProtocol(root)) hideMessage(root);
    for (const node of root.querySelectorAll?.('*') || []) {
      if (containsProtocol(node)) hideMessage(node);
    }
  }

  function start() {
    installStyle();
    scan();
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }
        if (mutation.target instanceof Element && containsProtocol(mutation.target)) {
          hideMessage(mutation.target);
        }
      }
    });
    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
    window.BingoV11Transport = { version: 1, scan };
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, {once:true});
})();
