(() => {
  'use strict';

  // Lightweight completion guard. It intentionally does NOT observe attributes,
  // because the guard itself changes classes/attributes on the composer.
  const READY_MARKER = '===BINGO_READY===';
  const MAX_CONTINUATIONS = 30;
  const CONTINUE_TEXT = 'Continue o trabalho BINGO. Ainda nao foi autorizado finalizar. Verifique o estado atual do projeto, execute as proximas ferramentas necessarias, corrija qualquer problema restante e so finalize quando o objetivo estiver realmente implementado e validado. Quando estiver realmente pronto, inclua ===BINGO_READY=== na resposta final.';

  let lastContinuationAt = 0;
  let continuations = 0;
  let lastAssistantSignature = '';
  let inspectScheduled = false;

  function composer() {
    return document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
  }

  function valueOf(el) {
    return el?.tagName === 'TEXTAREA' ? (el.value || '') : (el?.textContent || '');
  }

  function assistantNodes() {
    const selectors = [
      '[data-message-author-role="assistant"]',
      '[data-role="assistant"]',
      '.ds-markdown',
      '[class*="assistant"]'
    ];
    const nodes = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (!nodes.includes(node)) nodes.push(node);
      }
    }
    return nodes;
  }

  function stripReadyMarker() {
    for (const node of assistantNodes()) {
      if (!node.textContent?.includes(READY_MARKER)) continue;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const texts = [];
      let current;
      while ((current = walker.nextNode())) texts.push(current);
      for (const textNode of texts) {
        if (textNode.nodeValue?.includes(READY_MARKER)) {
          textNode.nodeValue = textNode.nodeValue.split(READY_MARKER).join('');
        }
      }
    }
  }

  function getLatestAssistantText() {
    const nodes = assistantNodes();
    if (!nodes.length) return '';
    const node = nodes[nodes.length - 1];
    return node.innerText || node.textContent || '';
  }

  function submitHiddenContinuation() {
    if (continuations >= MAX_CONTINUATIONS) return;
    const now = Date.now();
    if (now - lastContinuationAt < 2500) return;

    const el = composer();
    if (!el) return;

    lastContinuationAt = now;
    continuations++;

    // Do not mutate the DOM repeatedly while DeepSeek is rendering.
    if (el.dataset.bingoV11Continuation !== '1') {
      el.dataset.bingoV11Continuation = '1';
    }

    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, CONTINUE_TEXT); else el.value = CONTINUE_TEXT;
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    } else {
      el.textContent = CONTINUE_TEXT;
      el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:CONTINUE_TEXT}));
    }

    const form = el.closest('form');
    if (form?.requestSubmit) form.requestSubmit();
    else {
      const btn = [...document.querySelectorAll('button,[role="button"]')].find(button => {
        const text = `${button.getAttribute('aria-label') || ''} ${button.title || ''} ${button.innerText || ''}`.toLowerCase();
        return /send|enviar|submit/.test(text) && !button.disabled;
      });
      if (btn) btn.click();
      else el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    }
  }

  function inspect() {
    inspectScheduled = false;
    const latest = getLatestAssistantText();
    if (!latest) return;

    if (latest.includes(READY_MARKER)) {
      continuations = 0;
      lastAssistantSignature = latest.slice(-4000);
      stripReadyMarker();
      return;
    }

    const signature = latest.slice(-4000);
    if (signature === lastAssistantSignature) return;
    lastAssistantSignature = signature;

    if (!latest.includes('===BINGO_TOOL===')) return;

    setTimeout(() => {
      const current = getLatestAssistantText();
      if (!current || current.includes('===BINGO_TOOL===') || current.includes(READY_MARKER)) return;
      submitHiddenContinuation();
    }, 1800);
  }

  function scheduleInspect() {
    if (inspectScheduled) return;
    inspectScheduled = true;
    setTimeout(inspect, 150);
  }

  // No attribute observation: prevents feedback loops with the guard itself.
  const observer = new MutationObserver(scheduleInspect);
  if (document.body) observer.observe(document.body, {subtree:true, childList:true, characterData:true});
  setInterval(scheduleInspect, 1200);
  inspect();

  window.BingoV11RuntimeGuard = {
    version: 2,
    reset() {
      continuations = 0;
      lastAssistantSignature = '';
      const el = composer();
      if (el) el.removeAttribute('data-bingo-v11-continuation');
    }
  };
})();
