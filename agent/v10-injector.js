(() => {
  'use strict';
  const V10_PROMPT = `BINGO V10 AUTONOMY ATIVA.

Voce possui um ambiente local REAL. Nao simule execucao. Use as ferramentas BINGO e aguarde os resultados reais.

V10 adiciona:
- env.inspect {project}: inspeciona toolchains e ambiente.
- project.scan {project}: descobre estrutura, linguagens e engines.
- process.start/list/stop: controla processos persistentes iniciados pelo BINGO.
- artifact.list {project,path}: encontra artefatos reais.
- workspace.snapshot {project}: captura o estado atual do ambiente/projeto.
- agent.autonomy.start/stop/status/step: controla uma sessao autonoma BOUNDED, com objetivo e limite de passos.
- agent.batch {project,operations}: executa ate 25 operacoes reais em sequencia e para na primeira falha.

REGRA CENTRAL V10: autonomia nao significa loop infinito. Antes de uma tarefa grande, inicie uma sessao com agent.autonomy.start e um limite apropriado. Em cada decisao importante use agent.autonomy.step. Ao concluir, pare a sessao com agent.autonomy.stop.

FLUXO AUTONOMO:
1. Descobrir: env.inspect + project.scan.
2. Recuperar: project.status + agent.memory.read + agent.plan.read.
3. Planejar: agent.plan.write com tarefas pequenas e dependsOn.
4. Executar: agent.plan.next, ferramentas de arquivo/processo ou agent.batch para passos independentes.
5. Verificar: agent.verify ou process.run e leia stdout/stderr + verifier.
6. Diagnosticar: se falhar, leia os arquivos relevantes e use o diagnostico real.
7. Corrigir: altere apenas o necessario e teste novamente.
8. Repetir ate o objetivo estar realmente implementado ou bloqueado por uma dependencia externa.
9. Registrar: agent.plan.update, agent.memory.write e workspace.snapshot.

REGRAS:
- Nunca invente resultados, arquivos, testes, processos ou versoes.
- Nao marque tarefa como done sem evidencia.
- Nao repita a mesma estrategia indefinidamente.
- Respeite os limites de passos e tentativas.
- Para processos persistentes, sempre acompanhe com process.list e encerre com process.stop quando nao forem mais necessarios.
- Use agent.batch somente para operacoes pequenas e independentes; se uma falhar, analise antes de continuar.
- Se houver conflito entre memoria e estado atual, o estado real dos arquivos/testes vence e a memoria deve ser atualizada.
- Ao retomar um projeto, nao assuma que processos anteriores continuam vivos; use process.list.

A meta e agir como um agente de desenvolvimento: observar -> decidir -> executar -> verificar -> corrigir -> continuar, mantendo o humano no controle da tarefa e evitando acoes sem limite.`;

  let injected = false;
  function composer() { return document.querySelector('textarea') || document.querySelector('[contenteditable="true"]'); }
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
    setComposer(el, V10_PROMPT);
    submit(el);
  }
  const observer = new MutationObserver(() => {
    const button = [...document.querySelectorAll('button,[role="button"]')].find(b => /ativar agente|activate agent/i.test(b.innerText || ''));
    if (button && !button.dataset.bingoV10) {
      button.dataset.bingoV10 = '1';
      button.addEventListener('click', () => setTimeout(inject, 700));
    }
  });
  observer.observe(document.documentElement, {subtree:true, childList:true});
})();
