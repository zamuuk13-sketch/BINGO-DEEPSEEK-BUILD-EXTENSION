/* BINGO Extension Stage 11 — DeepSeek UI adapter. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  if (!core) return;

  const VERSION = 1;
  const SELECTORS = Object.freeze({
    composer: ['textarea', '[contenteditable="true"]'],
    assistant: ['[data-message-author-role="assistant"]', '[data-role="assistant"]', '.ds-markdown'],
    sendButton: ['button', '[role="button"]']
  });

  function first(selectors, root = document) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function all(selectors, root = document) {
    const result = [];
    for (const selector of selectors) {
      for (const node of root.querySelectorAll(selector)) if (!result.includes(node)) result.push(node);
    }
    return result;
  }

  function detectPage() { return /(^|\.)deepseek\.com$/i.test(location.hostname); }
  function findComposer() { return first(SELECTORS.composer); }

  function setComposerText(element, text) {
    if (!element) throw new Error('Composer do DeepSeek não encontrado.');
    const value = String(text ?? '');
    element.focus();
    if (element.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(element, value); else element.value = value;
      element.dispatchEvent(new Event('input', {bubbles:true}));
      element.dispatchEvent(new Event('change', {bubbles:true}));
      return element;
    }
    element.textContent = '';
    try { document.execCommand('insertText', false, value); } catch (_) { element.textContent = value; }
    element.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:value}));
    return element;
  }

  function submitComposer(element = findComposer()) {
    if (!element) return false;
    const form = element.closest('form');
    if (form?.requestSubmit) { form.requestSubmit(); return true; }
    const button = all(SELECTORS.sendButton).find(node => {
      const text = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''} ${node.innerText || ''}`.toLowerCase();
      return /send|enviar|submit/.test(text) && !node.disabled;
    });
    if (button) { button.click(); return true; }
    element.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    return true;
  }

  function extractMessageText(node) { return String(node?.innerText || node?.textContent || '').trim(); }
  function findAssistantMessages(root = document) { return all(SELECTORS.assistant, root); }
  function findLatestAssistantMessage(root = document) {
    const nodes = findAssistantMessages(root);
    return nodes[nodes.length - 1] || null;
  }

  function observeMessages(callback, options = {}) {
    if (typeof callback !== 'function') throw new TypeError('observeMessages exige callback.');
    const target = options.target || document.body || document.documentElement;
    const observer = new MutationObserver(mutations => callback(mutations));
    observer.observe(target, {childList:true, subtree:true, characterData:true});
    return () => observer.disconnect();
  }

  function getConversation() {
    return findAssistantMessages().map((node, index) => ({index, role:'assistant', text:extractMessageText(node)})).filter(item => item.text);
  }

  function getState() {
    return {version:VERSION, page:detectPage(), hostname:location.hostname, composer:!!findComposer(), assistantMessages:findAssistantMessages().length};
  }

  window.BingoDeepSeekAdapterV11 = Object.freeze({
    version:VERSION,
    selectors:SELECTORS,
    detectPage,
    findComposer,
    setComposerText,
    submitComposer,
    extractMessageText,
    findAssistantMessages,
    findLatestAssistantMessage,
    observeMessages,
    getConversation,
    getState
  });

  core.log('info', 'DeepSeek Adapter V11 ativo', {version:VERSION});
})();
