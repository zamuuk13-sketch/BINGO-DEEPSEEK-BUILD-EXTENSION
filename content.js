(() => {
  'use strict';

  const CONFIG_PROMPT = `Voce esta conectado ao BINGO DEEPSEEK BUILD v5, um agente autonomo de desenvolvimento local.

VOCE TEM FERRAMENTAS REAIS. Nao finja que executou algo. Tudo que precisar alterar no computador deve ser feito pelas ferramentas BINGO.

PROTOCOLO:
===BINGO_TOOL===
{"id":"req-1","tool":"fs.write","args":{"project":"MeuProjeto","path":"main.gd","content":"..."}}
===BINGO_END_TOOL===

A extensao executa a ferramenta e devolve:
===BINGO_RESULT===
{"protocol":"BINGO_AGENT_V5","id":"req-1","tool":"fs.write","ok":true,"result":{...}}
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
- process.run {project,command,args,cwd,timeout?}

MODO AUTONOMO:
1. Projeto novo: project.create primeiro.
2. Projeto existente: project.status e fs.list antes de modificar.
3. Inspecione arquivos relevantes com fs.read antes de corrigir problemas.
4. Depois de alterar algo, execute um teste/processo real com process.run.
5. Leia SEMPRE stdout e stderr quando process.run terminar.
6. exitCode 0 significa que aquele processo terminou com sucesso; nao significa que o projeto inteiro esta perfeito.
7. Se houver erro, identifique a causa, leia o arquivo relevante, corrija e execute novamente.
8. Trabalhe em ciclos INSPECIONAR -> ALTERAR -> EXECUTAR -> ANALISAR -> CORRIGIR.
9. Use IDs unicos nas BINGO_TOOL.
10. Nunca invente BINGO_RESULT, exitCode, arquivos ou testes.
11. Nao pare apenas porque um arquivo foi criado. Continue ate o objetivo solicitado estar implementado e testado.
12. Evite loops infinitos. Se a mesma falha persistir depois de 3 tentativas substancialmente diferentes, pare, explique a causa e informe o que ainda precisa ser resolvido.
13. Ao finalizar, informe os arquivos principais alterados e os testes realmente executados.
14. process.run nao usa shell. Passe executavel e argumentos separadamente.
15. Para Godot, prefira comandos que realmente validem o projeto/script e capturem stderr/stdout.
16. Para Python/Node, execute o interpretador diretamente com argumentos separados.

MEMORIA DE SESSAO:
- Considere todos os BINGO_RESULT recebidos como estado real da sessao.
- Nao repita uma operacao que ja retornou sucesso sem motivo.
- Use os resultados de leitura/teste anteriores para decidir o proximo passo.

A bridge Python possui sandbox de caminhos e lista de executaveis permitidos. A extensao coordena o agente; a bridge executa as operacoes locais.`;

  const MAX_RETRIES_PER_SIGNATURE = 3;
  const MAX_HISTORY = 150;
  let active = false;
  let observer = null;
  let toolQueue = Promise.resolve();
  const processed = new Set();
  const retryCounts = new Map();
  const toolHistory = [];
  const pendingQueue = [];
  const sessionState = {
    project: null,
    lastResult: null,
    tests: [],
    startedAt: null
  };

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
    p.innerHTML = '<b>🧠 BINGO AGENT v5</b><span id="bingo-status">Desconectado</span><span id="bingo-tools">0 tools executadas</span><span id="bingo-queue">Fila: 0</span><span id="bingo-retries">Falhas repetidas: 0</span><button id="bingo-agent-start">Ativar agente</button>';
    Object.assign(p.style, {position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:'#101010',color:'#fff',padding:'14px',borderRadius:'14px',boxShadow:'0 8px 35px #0009',font:'13px Arial',width:'250px',border:'1px solid #333'});
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
    if (queue) queue.textContent = `Fila: ${pendingQueue.length}`;
    const retries = document.getElementById('bingo-retries');
    if (retries) retries.textContent = `Falhas repetidas: ${[...retryCounts.values()].filter(v => v > 0).length}`;
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

  function signature(request) {
    try { return `${request.tool}|${JSON.stringify(request.args || {})}`; }
    catch { return `${request.tool}|unserializable`; }
  }

  function rememberResult(request, result) {
    const entry = {
      at: Date.now(),
      id: request.id,
      tool: request.tool,
      ok: !!result.ok,
      result: result.result ?? null,
      error: result.error || null
    };
    sessionState.lastResult = entry;
    toolHistory.push(entry);
    if (toolHistory.length > MAX_HISTORY) toolHistory.shift();
    if (request.tool === 'project.create' && result.ok) sessionState.project = result.result?.project || request.args?.name || null;
    if (request.tool === 'process.run' && result.ok) {
      sessionState.tests.push({at:Date.now(), project:request.args?.project, command:request.args?.command, exitCode:result.result?.exitCode});
      if (sessionState.tests.length > 50) sessionState.tests.shift();
    }
  }

  function enqueueTool(request) {
    const id = String(request.id || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    request.id = id;
    if (processed.has(id) || pendingQueue.some(item => item.id === id)) return;
    pendingQueue.push(request);
    updatePanel();
    toolQueue = toolQueue.then(() => executeTool(request)).catch(error => {
      setStatus(`Erro na fila: ${error.message || error}`);
    });
  }

  async function executeTool(request) {
    const id = String(request.id);
    if (processed.has(id)) return;
    processed.add(id);
    pendingQueue.splice(pendingQueue.findIndex(item => item.id === id), 1);
    updatePanel();
    setStatus(`Executando ${request.tool}...`);

    let result;
    try {
      if (request.__error) throw new Error(request.__error);
      if (!window.BingoAgent) throw new Error('BingoAgent nao carregado.');
      const tools = window.BingoAgent.listTools();
      if (!tools[request.tool]) throw new Error(`Ferramenta desconhecida: ${request.tool}`);
      result = await window.BingoAgent.call(request.tool, request.args || {});
    } catch (error) {
      result = {ok:false, error:{message:error.message || String(error)}};
    }

    rememberResult(request, result);
    const sig = signature(request);
    if (!result.ok) retryCounts.set(sig, (retryCounts.get(sig) || 0) + 1);
    else retryCounts.delete(sig);

    const retries = retryCounts.get(sig) || 0;
    if (!result.ok && retries >= MAX_RETRIES_PER_SIGNATURE) {
      setStatus(`✗ ${request.tool} — limite de tentativas`);
    } else {
      setStatus(result.ok ? `✓ ${request.tool}` : `✗ ${request.tool}`);
    }
    updatePanel();

    const payload = {
      protocol:'BINGO_AGENT_V5',
      id,
      tool:request.tool,
      ok:!!result.ok,
      result:result.result ?? result.data ?? null,
      error:result.error || null,
      session:{project:sessionState.project, recentTests:sessionState.tests.slice(-5)}
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
      if (id && pendingQueue.some(item => String(item.id) === id)) continue;
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
      return;
    }

    const el = composer();
    if (!el) { setStatus('Composer nao encontrado.'); return; }
    active = true;
    sessionState.startedAt = Date.now();
    setComposer(el, CONFIG_PROMPT);
    submit(el);
    setStatus('Agente v5 ativo ✓');
    watch();
  }

  function boot() {
    createPanel();
    setStatus('Pronto — inicie a bridge Python e clique em Ativar agente');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
