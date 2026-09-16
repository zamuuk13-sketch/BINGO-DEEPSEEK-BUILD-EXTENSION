(() => {
  'use strict';

  const CONFIG_PROMPT = `Voce esta conectado ao BINGO DEEPSEEK BUILD v4, um agente autonomo de desenvolvimento.

VOCE TEM FERRAMENTAS REAIS. Nao finja que executou algo. Tudo que precisar alterar no computador deve ser feito pelas ferramentas BINGO abaixo.

PROTOCOLO:
===BINGO_TOOL===
{"id":"req-1","tool":"fs.write","args":{"project":"MeuProjeto","path":"main.gd","content":"..."}}
===BINGO_END_TOOL===

A extensao executa a ferramenta e devolve:
===BINGO_RESULT===
{"protocol":"BINGO_AGENT_V4","id":"req-1","tool":"fs.write","ok":true,"result":{...}}
===BINGO_END_RESULT===

FERRAMENTAS:
- project.create {name}
- project.status {project}
- fs.mkdir {project,path}
- fs.write {project,path,content}
- fs.read {project,path}
- fs.list {project,path}
- fs.delete {project,path}
- fs.rename {project,from,to}
- process.run {project,command,args,cwd}

MODO AUTONOMO OBRIGATORIO:
1. Projeto novo: project.create primeiro.
2. Crie a estrutura com fs.mkdir e fs.write.
3. Projeto existente: use project.status e fs.list antes de modificar.
4. Para entender um erro, use fs.read no arquivo relevante e depois process.run para reproduzir.
5. Depois de uma correcao, execute novamente o processo/teste e leia stdout/stderr.
6. Se o processo retornar exitCode diferente de 0, trate isso como falha real e continue investigando/corrigindo.
7. Nao diga que algo esta funcionando sem um resultado de ferramenta que comprove isso.
8. Pode emitir varias BINGO_TOOL, mas use IDs unicos. A extensao executara uma por vez para manter a ordem.
9. Nao coloque BINGO_TOOL dentro de blocos de codigo comuns.
10. Depois de cada BINGO_RESULT, continue automaticamente o trabalho. Nao pare apenas porque um arquivo foi criado.
11. Continue em ciclos INSPECIONAR -> ALTERAR -> EXECUTAR -> LER RESULTADO -> CORRIGIR ate concluir o objetivo.
12. Ao criar jogos/apps, priorize arquivos realmente executaveis e teste-os. Nao entregue somente uma arquitetura teorica.
13. Se uma ferramenta falhar, nao invente sucesso: analise a mensagem de erro e tente uma abordagem corrigida.
14. process.run nao usa shell. Passe executavel e argumentos separadamente.
15. Ao finalizar, informe resumidamente o que foi criado e quais testes tiveram exitCode 0.

A bridge local aplica sandbox de caminhos e uma lista de executaveis permitidos. A extensao e a interface; a bridge Python executa as operacoes locais.`;

  let active = false;
  let observer = null;
  let toolQueue = Promise.resolve();
  const processed = new Set();
  const toolHistory = [];

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function composer() {
    return document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
  }

  function setComposer(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
    } else {
      el.textContent = '';
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:text }));
    }
  }

  function submit(el) {
    const form = el.closest('form');
    if (form?.requestSubmit) { form.requestSubmit(); return; }
    const btn = [...document.querySelectorAll('button,[role="button"]')].find(b => {
      const t = `${b.getAttribute('aria-label') || ''} ${b.title || ''} ${b.innerText || ''}`.toLowerCase();
      return /send|enviar|submit/.test(t) && !b.disabled;
    });
    if (btn) { btn.click(); return; }
    el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
  }

  function setStatus(text) {
    const el = document.getElementById('bingo-status');
    if (el) el.textContent = text;
  }

  function createPanel() {
    if (document.getElementById('bingo-agent-panel')) return;
    const p = document.createElement('div');
    p.id = 'bingo-agent-panel';
    p.innerHTML = '<b>🧠 BINGO AGENT v4</b><span id="bingo-status">Desconectado</span><span id="bingo-tools">0 tools executadas</span><span id="bingo-queue">Fila: 0</span><button id="bingo-agent-start">Ativar agente</button>';
    Object.assign(p.style, {position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:'#101010',color:'#fff',padding:'14px',borderRadius:'14px',boxShadow:'0 8px 35px #0009',font:'13px Arial',width:'235px',border:'1px solid #333'});
    for (const s of p.querySelectorAll('span')) Object.assign(s.style,{display:'block',marginTop:'7px',color:'#bbb'});
    const b = p.querySelector('button');
    Object.assign(b.style,{marginTop:'10px',width:'100%',padding:'8px',border:0,borderRadius:'8px',cursor:'pointer'});
    b.onclick = startAgent;
    document.body.appendChild(p);
  }

  function updatePanel() {
    const tools = document.getElementById('bingo-tools');
    if (tools) tools.textContent = `${toolHistory.length} tools executadas`;
    const queue = document.getElementById('bingo-queue');
    if (queue) queue.textContent = `Fila: ${Math.max(0, pendingQueue.length)}`;
  }

  function extractToolCalls(text) {
    const out = [];
    const re = /===BINGO_TOOL===\s*([\s\S]*?)\s*===BINGO_END_TOOL===/gi;
    let m;
    while ((m = re.exec(text))) {
      try {
        const value = JSON.parse(m[1].trim());
        if (value && typeof value === 'object') out.push(value);
      } catch (e) {
        out.push({id:`parse-${Date.now()}-${Math.random().toString(36).slice(2)}`, tool:'__parse_error__', args:{}, __error:'JSON invalido no tool call.'});
      }
    }
    return out;
  }

  function collectAssistantText() {
    const selectors = [
      '[data-message-author-role="assistant"]',
      '[data-role="assistant"]',
      '.ds-markdown',
      '[class*="assistant"]'
    ];
    const nodes = [];
    for (const selector of selectors) for (const n of document.querySelectorAll(selector)) if (!nodes.includes(n)) nodes.push(n);
    return nodes.map(n => n.innerText || n.textContent || '').join('\n');
  }

  const pendingQueue = [];

  function enqueueTool(request) {
    pendingQueue.push(request);
    updatePanel();
    toolQueue = toolQueue.then(() => executeTool(request)).catch(() => {});
  }

  async function executeTool(request) {
    const id = String(request.id || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    if (processed.has(id)) return;
    processed.add(id);
    toolHistory.push({id,tool:request.tool,status:'executando'});
    pendingQueue.shift();
    updatePanel();
    setStatus(`Executando ${request.tool}...`);

    let result;
    try {
      if (request.__error) throw new Error(request.__error);
      if (!window.BingoAgent) throw new Error('BingoAgent nao carregado.');
      const tools = window.BingoAgent.listTools();
      if (!tools[request.tool]) throw new Error(`Ferramenta desconhecida: ${request.tool}`);
      result = await window.BingoAgent.call(request.tool, request.args || {});
      toolHistory[toolHistory.length - 1].status = result.ok ? 'ok' : 'erro';
      setStatus(result.ok ? `✓ ${request.tool}` : `✗ ${request.tool}`);
    } catch (error) {
      result = {ok:false, error:{message:error.message || String(error)}};
      toolHistory[toolHistory.length - 1].status = 'erro';
      setStatus(`✗ ${request.tool}`);
    }
    updatePanel();

    const payload = {
      protocol:'BINGO_AGENT_V4',
      id,
      tool:request.tool,
      ok:!!result.ok,
      result:result.result ?? result.data ?? null,
      error:result.error || null
    };
    const message = `===BINGO_RESULT===\n${JSON.stringify(payload)}\n===BINGO_END_RESULT===`;
    await sleep(250);
    const el = composer();
    if (!el) { setStatus('Composer nao encontrado para devolver resultado.'); return; }
    setComposer(el, message);
    submit(el);
  }

  function scan() {
    if (!active) return;
    const text = collectAssistantText();
    if (!text.includes('===BINGO_TOOL===')) return;
    for (const request of extractToolCalls(text)) {
      const id = String(request.id || '');
      if (id && processed.has(id)) continue;
      if (pendingQueue.some(item => String(item.id || '') === id)) continue;
      enqueueTool(request);
    }
  }

  function watch() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(scan);
    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
    scan();
  }

  async function startAgent() {
    if (active) return;
    active = true;
    createPanel();
    setStatus('Testando bridge Python...');
    try {
      const health = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({type:'BINGO_BRIDGE_HEALTH'}, response => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!response?.ok) reject(new Error(response?.error || 'Bridge indisponivel'));
          else resolve(response);
        });
      });
      setStatus(`Bridge OK • porta ${health.port || 8765}`);
    } catch (error) {
      setStatus('Bridge Python offline — inicie o .bat');
      active = false;
      return;
    }

    const el = composer();
    if (!el) { setStatus('Composer nao encontrado.'); active = false; return; }
    setComposer(el, CONFIG_PROMPT);
    submit(el);
    setStatus('Agente ativo ✓');
    watch();
  }

  function boot() {
    createPanel();
    setStatus('Pronto — inicie a bridge Python e clique em Ativar agente');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
