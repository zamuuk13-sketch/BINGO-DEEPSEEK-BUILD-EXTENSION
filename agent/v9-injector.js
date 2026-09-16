(() => {
  'use strict';
  const V9_PROMPT = `BINGO V9 ENVIRONMENT ATIVO. Alem do planner V7 e verifier V8, voce agora controla um ambiente local de desenvolvimento real.

NOVAS FERRAMENTAS V9:
- env.inspect {project} -> detecta SO, Python e toolchains disponiveis.
- project.scan {project} -> varre arquivos reais e detecta Godot/Node/Python/C++/Rust.
- process.start {project,command,args,cwd} -> inicia processos longos aprovados e retorna sessionId.
- process.list {project} -> lista processos gerenciados pelo BINGO.
- process.stop {sessionId,force} -> encerra um processo gerenciado.
- artifact.list {project,path} -> lista artefatos reais por data/tamanho.
- workspace.snapshot {project} -> captura ambiente + projeto + plano + testes + erros + processos.

REGRAS V9:
1. Antes de trabalhar em um projeto desconhecido, use project.scan e env.inspect.
2. Para servidores, watchers ou playtests longos, prefira process.start em vez de process.run.
3. Guarde o sessionId de cada processo longo e use process.list/stop para gerencia-lo.
4. Depois de mudancas importantes, use workspace.snapshot para recuperar o estado real.
5. Nunca invente que um processo esta rodando: confirme com process.list.
6. Nunca invente que um arquivo existe: confirme com project.scan, fs.list ou fs.read.
7. Continue usando PLAN -> MODIFY -> VERIFY -> DIAGNOSE -> FIX -> VERIFY.
8. Nao execute comandos fora da allowlist da bridge e nao use shell para contornar as protecoes.
9. O objetivo do V9 e dar ao agente consciencia operacional do ambiente, nao apenas editar arquivos.`;
  let injected = false;
  function composer(){return document.querySelector('textarea')||document.querySelector('[contenteditable="true"]')}
  function setComposer(el,text){el.focus();if(el.tagName==='TEXTAREA'){const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(setter)setter.call(el,text);else el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}else{el.textContent=text;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}))}}
  function submit(el){const form=el.closest('form');if(form?.requestSubmit){form.requestSubmit();return}const btn=[...document.querySelectorAll('button,[role="button"]')].find(b=>`${b.getAttribute('aria-label')||''} ${b.title||''} ${b.innerText||''}`.toLowerCase().match(/send|enviar|submit/)&&!b.disabled);if(btn)btn.click()}
  function inject(){if(injected)return;const el=composer();if(!el)return;injected=true;setComposer(el,V9_PROMPT);submit(el)}
  const observer=new MutationObserver(()=>{const button=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').includes('Ativar agente'));if(button&&!button.dataset.bingoV9){button.dataset.bingoV9='1';button.addEventListener('click',()=>setTimeout(inject,900))}});
  observer.observe(document.documentElement,{subtree:true,childList:true});
})();
