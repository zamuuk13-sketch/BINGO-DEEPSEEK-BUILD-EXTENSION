(() => {
  'use strict';

  let connected = false;
  let initialized = false;
  let lastAssistant = '';
  const seen = new WeakMap();

  function send(type, payload = {}) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({type, ...payload}, response => resolve(response || {ok:false}));
    });
  }

  function composer() {
    return document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
  }

  function setComposer(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    } else {
      el.textContent = '';
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:text}));
    }
  }

  function submit(el) {
    const form = el.closest('form');
    if (form?.requestSubmit) { form.requestSubmit(); return true; }
    const button = [...document.querySelectorAll('button,[role="button"]')].find(b => {
      const t = `${b.getAttribute('aria-label') || ''} ${b.title || ''} ${b.innerText || ''}`.toLowerCase();
      return /send|enviar|submit/.test(t) && !b.disabled;
    });
    if (button) { button.click(); return true; }
    el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    return true;
  }

  function assistantNodes() {
    const selectors = ['[data-message-author-role="assistant"]','[data-role="assistant"]','.ds-markdown'];
    const result = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) if (!result.includes(node)) result.push(node);
    }
    return result;
  }

  async function connect() {
    const name = document.title || 'DeepSeek';
    const response = await send('BINGO_DESKTOP_CONNECT', {chatName:name});
    connected = !!response.ok;
    if (!initialized) {
      const nodes = assistantNodes();
      const last = nodes[nodes.length - 1];
      lastAssistant = last ? (last.innerText || last.textContent || '').trim() : '';
      for (const node of nodes) seen.set(node, node.innerText || node.textContent || '');
      initialized = true;
    }
    return connected;
  }

  async function pollOutbound() {
    if (!connected) return;
    const response = await send('BINGO_DESKTOP_POLL');
    if (!response?.ok || !response.message?.text) return;
    const el = composer();
    if (!el) return;
    setComposer(el, response.message.text);
    submit(el);
  }

  let timer = null;
  function forwardAssistant(node) {
    if (!(node instanceof Element)) return;
    const text = (node.innerText || node.textContent || '').trim();
    if (!text || text === lastAssistant || text === seen.get(node)) return;
    seen.set(node, text);
    clearTimeout(node.__bingoDesktopTimer);
    node.__bingoDesktopTimer = setTimeout(async () => {
      const stable = (node.innerText || node.textContent || '').trim();
      if (!stable || stable === lastAssistant) return;
      lastAssistant = stable;
      await send('BINGO_DESKTOP_ASSISTANT', {text: stable});
    }, 900);
  }

  function scan() {
    if (!connected) return;
    const nodes = assistantNodes();
    const last = nodes[nodes.length - 1];
    if (last) forwardAssistant(last);
  }

  async function start() {
    try { await connect(); } catch { connected = false; }
    if (!connected) {
      setTimeout(start, 1500);
      return;
    }
    const observer = new MutationObserver(scan);
    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
    setInterval(() => { pollOutbound().catch(() => {}); scan(); }, 700);
  }

  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, {once:true});
})();
