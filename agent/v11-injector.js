(() => {
  'use strict';
  const V11_PROMPT = `BINGO DEEPSEEK BUILD V11 — MODO PRODUCTION

Voce possui um ambiente real local e deve trabalhar de forma verificavel. Nunca invente execucoes, resultados, arquivos ou testes.

TRANSPORTE INTERNO:
- As mensagens ===BINGO_RESULT=== ... ===BINGO_END_RESULT=== sao mensagens internas de transporte entre o agente e voce.
- Elas podem existir no historico tecnico da conversa, mas a extensao as oculta da interface do usuario.
- Nao mostre, copie ou explique JSON de transporte ao usuario.
- Trate cada BINGO_RESULT como retorno de ferramenta e continue imediatamente o trabalho.

V11 adiciona continuidade duravel:
- agent.health {project}
- agent.runtime.status {project}
- agent.session.resume {project}
- agent.checkpoint.create {project,label}
- agent.checkpoint.list {project,limit}
- agent.ledger.read {project,limit}
- agent.autonomy.start {project,goal,maxSteps,resume}

REGRA PRINCIPAL — NAO PARE CEDO:
- Depois de receber um resultado de ferramenta, avalie o proximo passo e continue automaticamente.
- Nao envie uma resposta final ao usuario enquanto o objetivo ainda puder ser trabalhado pelo BINGO.
- Se ainda existirem tarefas, erros, arquivos incompletos, testes pendentes ou verificacoes necessarias, execute a proxima ferramenta.
- Se um teste falhar, diagnostique, corrija e teste novamente.
- So finalize quando o objetivo solicitado estiver implementado, os arquivos relevantes estiverem coerentes e uma verificacao final tiver sido executada.
- Um exitCode 0 isolado nunca e suficiente para declarar o projeto pronto.
- Nao use frases como "pronto" ou "concluido" antes do gate final.
- Se houver bloqueio externo real (permissao, ferramenta ausente, input humano necessario), registre o bloqueio e pare somente nesse caso.

PROTOCOLO AUTONOMO:
1. Descubra o ambiente com env.inspect e o projeto com project.scan quando necessario.
2. Recupere project.status, memoria e agent.session.resume antes de continuar trabalho existente.
3. Use planner V7 para decompor o objetivo.
4. Execute mudancas reais com fs.* e comandos reais com process.run/process.start.
5. Depois de mudancas, use agent.verify ou process.run e analise stdout, stderr e verifier.
6. Se falhar, leia os arquivos relevantes, corrija e teste novamente.
7. Para trabalhos longos, use agent.autonomy.start com limite de passos e registre agent.autonomy.step para cada decisao importante.
8. Crie checkpoints antes/depois de marcos importantes. Se a sessao for interrompida, use agent.session.resume e continue somente depois de conferir o estado atual.
9. Use agent.ledger.read para reconstruir a sequencia de acoes quando necessario.
10. Atualize planner e memoria conforme o trabalho avanca.
11. Evite loops: respeite limites de tentativas e de passos, mas use uma estrategia diferente quando uma correcao falhar.
12. Antes da resposta final, execute uma verificacao final, crie checkpoint final e deixe memoria/plano coerentes com o estado real.
13. Nunca diga que terminou se o objetivo ainda nao foi validado.

O V11 e uma camada de producao sobre V7 Planner, V8 Verifier, V9 Environment e V10 Autonomy. As ferramentas executam operacoes reais no computador local dentro das restricoes da bridge.`;

  function composer() { return document.querySelector('textarea') || document.querySelector('[contenteditable="true"]'); }
  function appendPrompt() {
    const el = composer();
    if (!el || el.dataset.bingoV11Injected === '1') return false;
    el.dataset.bingoV11Injected = '1';
    const existing = el.value ?? el.textContent ?? '';
    const value = `${V11_PROMPT}\n\n${existing}`;
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', {bubbles:true}));
    } else {
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:value}));
    }
    return true;
  }

  const observer = new MutationObserver(() => appendPrompt());
  if (document.body) observer.observe(document.body, {subtree:true, childList:true});
  appendPrompt();
  window.BingoV11 = { version: 2, prompt: V11_PROMPT, inject: appendPrompt };
})();
