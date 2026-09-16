(() => {
  'use strict';

  const CONFIG_PROMPT = `Voce esta conectado ao BINGO DEEPSEEK BUILD v3, um agente real de desenvolvimento.

VOCE TEM FERRAMENTAS REAIS. Nao finja que executou algo. Use as ferramentas abaixo para criar e modificar projetos no computador do usuario.

PROTOCOLO DE TOOL CALL:
===BINGO_TOOL===
{"id":"req-1","tool":"fs.write","args":{"project":"MeuProjeto","path":"main.gd","content":"..."}}
===BINGO_END_TOOL===

Depois que a extensao executar a ferramenta, ela enviara:
===BINGO_RESULT===
{"id":"req-1","ok":true,"tool":"fs.write","result":{...}}
===BINGO_END_RESULT===

FERRAMENTAS DISPONIVEIS:
- project.create {name}
- project.status {project}
- fs.mkdir {project,path}
- fs.write {project,path,content}
- fs.read {project,path}
- fs.list {project,path}
- fs.delete {project,path}
- fs.rename {project,from,to}
- process.run {project,command,args,cwd}

REGRAS OBRIGATORIAS:
1. Para um projeto novo, use project.create primeiro.
2. Depois crie pastas e arquivos com fs.mkdir/fs.write.
3. Antes de corrigir um projeto existente, use fs.list e fs.read para inspecionar o estado real.
4. Quando houver erro, leia o arquivo relevante, corrija, execute o teste/processo e leia o resultado antes de afirmar que resolveu.
5. Use process.run somente com executaveis apropriados ao projeto; prefira chamadas diretas, sem shell.
6. Nunca diga que uma ferramenta foi executada sem receber BINGO_RESULT.
7. Um BINGO_RESULT com ok:false significa que a operacao falhou. Analise o erro e tente outra abordagem quando apropriado.
8. Pode fazer varias tool calls em sequencia. Use IDs unicos.
9. Nao coloque BINGO_TOOL dentro de blocos de codigo comuns.
10. Continue a conversa automaticamente depois de cada BINGO_RESULT.
11. Quando o usuario pedir para criar um jogo/app, execute o trabalho de verdade no projeto local em vez de apenas entregar um bloco de codigo.

IMPORTANTE: a bridge local trabalha em uma area de projetos do usuario e aplica validacao de caminhos. A extensao e o agente de interface; a bridge e quem executa as operacoes locais.`;

  let active = false;
  let observer = null;
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
    p.innerHTML = '<b>🧠 BINGO AGENT v3</b><span id="bingo-status">Desconectado</span><span id="bingo-tools">0 tools executadas</span><button id="bingo-agent-start">Ativar agente</button>';
    Object.assign(p.style, {position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:'#101010',color:'#fff',padding:'14px',borderRadius:'14px',boxShadow:'0 8px 35px #0009',font:'13px Arial',width:'235px',border:'1px solid #333'});
    for (const s of p.querySelectorAll('span')) Object.assign(s.style,{display:'block',marginTop:'7px',color:'#bbb'});
    const b = p.querySelector('button');
    Object.assign(b.style,{marginTop:'10px',width:'100%',padding:'8px',border:0,borderRadius:'8px',cursor:'pointer'});
    b.onclick = startAgent;
    document.body.appendChild(p);
  }

  function updatePanel() {
    const el = document.getElementById('bingo-tools');
    if (el) el.textContent = `${toolHistory.length} tools executadas`;
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
        out.push({id:`parse-${Date.now()}`, tool:'__parse_error__', args:{}, __error:'JSON invalido no tool call.'});
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

  async function executeTool(request) {
    const id = String(request.id || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    if (processed.has(id)) return;
    processed.add(id);
    toolHistory.push({id,tool:request.tool,status:'executando'});
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

    const payload = { protocol:'BINGO_AGENT_V3', id, tool:request.tool, ok:!!result.ok, result:result.result ?? result.data ?? null, error:result.error || null };
    const message = `===BINGO_RESULT===\n${JSON.stringify(payload)}\n===BINGO_END_RESULT===`;
    await sleep(150);
    const el = composer();
    if (!el) { setStatus('Composer nao encontrado para devolver resultado.'); return; }
    setComposer(el, message);
    submit(el);
  }

  function scan() {
    if (!active) return;
    const text = collectAssistantText();
    if (!text.includes('===BINGO_TOOL===')) return;
    for (const request of extractToolCalls(text)) executeTool(request);
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
    setStatus('Conectando agente...');
    const el = composer();
    if (!el) { setStatus('Composer nao encontrado.'); return; }
    setComposer(el, CONFIG_PROMPT);
    submit(el);
    setStatus('Agente ativo ✓');
    watch();
  }

  function boot() {
    createPanel();
    setStatus('Pronto — clique em Ativar agente');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
