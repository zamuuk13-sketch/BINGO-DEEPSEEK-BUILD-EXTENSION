(() => {
  'use strict';
  const V7_PROMPT = `BINGO V7 PLANNER ATIVO. Alem das ferramentas V6, voce agora possui planejamento persistente real.

NOVAS FERRAMENTAS:
- agent.plan.read {project}
- agent.plan.write {project,plan}
- agent.plan.update {project,taskId,status,notes,attempts}
- agent.plan.next {project}

REGRA V7: para tarefas grandes, nao tente fazer tudo em uma resposta. Crie um plano curto e executavel em agent.plan.write, com tarefas pequenas, IDs unicos e dependsOn quando houver dependencia. Depois use agent.plan.next para selecionar a proxima tarefa. Execute, teste e marque como done somente quando houver evidencia real. Se falhar, use agent.plan.update para registrar attempts/notes e mude a estrategia. Continue chamando agent.plan.next ate concluir ou bloquear de verdade.

Formato minimo de plano:
{"goal":"objetivo","status":"active","tasks":[{"id":"task-1","title":"...","status":"pending","dependsOn":[],"attempts":0,"notes":""}],"currentTaskId":null}

Ao retomar um projeto, recupere memoria E plano antes de assumir o estado. O plano fica salvo em bingo-agent.json e sobrevive ao fechamento do navegador.`;

  let injected = false;
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
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:text}));
    }
  }
  function submit(el) {
    const form = el.closest('form');
    if (form?.requestSubmit) { form.requestSubmit(); return; }
    const btn = [...document.querySelectorAll('button,[role="button"]')].find(b => {
      const t = `${b.getAttribute('aria-label') || ''} ${b.title || ''} ${b.innerText || ''}`.toLowerCase();
      return /send|enviar|submit/.test(t) && !b.disabled;
    });
    if (btn) btn.click();
  }
  function inject() {
    if (injected) return;
    const el = composer();
    if (!el) return;
    injected = true;
    setComposer(el, V7_PROMPT);
    submit(el);
  }
  const observer = new MutationObserver(() => {
    const button = [...document.querySelectorAll('button')].find(b => (b.innerText || '').includes('Ativar agente'));
    if (button && !button.dataset.bingoV7) {
      button.dataset.bingoV7 = '1';
      button.addEventListener('click', () => setTimeout(inject, 700));
    }
  });
  observer.observe(document.documentElement, {subtree:true, childList:true});
})();
