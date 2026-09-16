(() => {
  'use strict';

  const PROTOCOL = 'BINGO_CONTROL_V2';
  const CONFIG_PROMPT = `Voce esta conectado ao BINGO DEEPSEEK BUILD v2. Este chat e uma interface normal de conversa, mas voce tambem possui uma ponte de controle fornecida pela extensao.

OBJETIVO: aja como AGENTE DE PROJETO. Nao limite sua tarefa a responder com codigo. Planeje, crie e mantenha projetos completos usando os comandos BINGO_CONTROL.

PROTOCOLO: quando precisar controlar o projeto, emita blocos JSON isolados neste formato:
===BINGO_CONTROL===
{"id":"unico","op":"fs.write","path":"src/main.gd","content":"..."}
===BINGO_END_CONTROL===

COMANDOS DISPONIVEIS:
- project.create {"name":"Nome"}
- project.rename {"name":"NovoNome"}
- fs.mkdir {"path":"pasta/subpasta"}
- fs.write {"path":"arquivo","content":"conteudo completo"}
- fs.read {"path":"arquivo"}
- fs.list {}
- fs.delete {"path":"arquivo-ou-pasta"}
- fs.rename {"from":"a","to":"b"}
- project.status {}
- project.export {}
- project.test {"kind":"static"}
- ui.status {"text":"mensagem"}

REGRAS DE AGENTE:
1. Use caminhos relativos e preserve a estrutura de pastas.
2. Antes de alterar um projeto existente, use fs.list/fs.read quando precisar conhecer o estado atual.
3. Para projetos novos, crie primeiro o projeto e depois as pastas/arquivos.
4. Nunca diga que criou um arquivo se o comando correspondente nao foi emitido.
5. Depois de uma operacao, continue o trabalho normalmente; a extensao devolvera o resultado em um bloco BINGO_RESULT.
6. Para testar, use project.test. Na versao browser, o teste e estatico/estrutural; testes que exigem executar um programa nativo ficam marcados como indisponiveis ate existir um bridge local.
7. Use project.export somente quando o projeto estiver pronto ou quando o usuario pedir exportacao.
8. Nao coloque comandos BINGO_CONTROL dentro de blocos de codigo comuns.
9. O usuario continua podendo conversar normalmente; os comandos sao sua API de ferramentas.

CAPACIDADE REAL DA V2: a extensao interpreta seus comandos e mantem uma arvore virtual de projeto, arquivos, pastas, historico e exportacao ZIP. Ela nao deve fingir acesso ao PC, terminal ou Godot: isso sera adicionado por um bridge local separado.`,

  let active = false;
  let projectName = 'DeepSeek-Project';
  let files = {};
  let folders = new Set();
  let history = [];
  let processed = new Set();
  let observer = null;
  let lastBody = '';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normalize = p => String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/^\.\//, '');
  const safePath = p => {
    const path = normalize(p);
    return !!path && !path.split('/').includes('..') && !path.startsWith('/');
  };

  function findComposer() {
    return document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
  }

  function setComposer(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.textContent = '';
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }

  function submitComposer(el) {
    const form = el.closest('form');
    if (form?.requestSubmit) { form.requestSubmit(); return true; }
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.find(b => {
      const t = `${b.getAttribute('aria-label') || ''} ${b.title || ''} ${b.innerText || ''}`.toLowerCase();
      return /send|enviar|submit/.test(t) && !b.disabled;
    });
    if (btn) { btn.click(); return true; }
    el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
    return true;
  }

  async function openNewChat() {
    const candidates = [...document.querySelectorAll('button,a,[role="button"]')];
    const button = candidates.find(e => {
      const text = `${e.getAttribute('aria-label') || ''} ${e.title || ''} ${e.innerText || ''}`.toLowerCase().trim();
      return /new chat|new conversation|nova conversa|novo chat|new session/.test(text);
    });
    if (button) { button.click(); await sleep(1200); return true; }
    return false;
  }

  async function startMode() {
    active = true;
    files = {};
    folders = new Set();
    history = [];
    processed = new Set();
    createPanel();
    setStatus('Abrindo ambiente de agente...');
    await openNewChat();
    const composer = findComposer();
    if (!composer) { setStatus('Caixa de mensagem nao encontrada. Recarregue o DeepSeek.'); return; }
    setComposer(composer, CONFIG_PROMPT);
    submitComposer(composer);
    setStatus('Agente BINGO ativo ✓');
    watch();
  }

  function emitResult(id, ok, op, data = {}, error = '') {
    const result = { protocol: PROTOCOL, id, ok, op, ...data, error: error || undefined };
    history.push({ at: Date.now(), id, op, ok, detail: error || (data.message || '') });
    if (history.length > 100) history.shift();
    chrome.runtime.sendMessage({ type:'COMMAND_AUDIT', id, op, ok, detail: error || (data.message || '') });
    queueMicrotask(() => injectResult(result));
  }

  function injectResult(result) {
    const composer = findComposer();
    if (!composer) return;
    const text = `===BINGO_RESULT===\n${JSON.stringify(result)}\n===BINGO_END_RESULT===`;
    setComposer(composer, text);
    submitComposer(composer);
  }

  function snapshot() {
    const state = { name: projectName, files, folders:[...folders], history };
    chrome.runtime.sendMessage({ type:'PROJECT_STATE', ...state });
  }

  async function executeCommand(cmd) {
    const id = String(cmd.id || crypto.randomUUID());
    if (processed.has(id)) return;
    processed.add(id);
    const op = String(cmd.op || '').trim();
    try {
      switch (op) {
        case 'project.create':
          projectName = String(cmd.name || 'DeepSeek-Project').trim() || 'DeepSeek-Project';
          files = {};
          folders = new Set();
          emitResult(id, true, op, { name: projectName, message:'Projeto criado.' });
          break;
        case 'project.rename':
          projectName = String(cmd.name || projectName).trim() || projectName;
          emitResult(id, true, op, { name: projectName, message:'Projeto renomeado.' });
          break;
        case 'fs.mkdir': {
          const p = normalize(cmd.path);
          if (!safePath(p)) throw new Error('Caminho invalido.');
          folders.add(p.replace(/\/$/, ''));
          emitResult(id, true, op, { path:p, message:'Pasta criada.' });
          break;
        }
        case 'fs.write': {
          const p = normalize(cmd.path);
          if (!safePath(p)) throw new Error('Caminho invalido.');
          const parts = p.split('/');
          for (let i=1;i<parts.length;i++) folders.add(parts.slice(0,i).join('/'));
          files[p] = String(cmd.content ?? '');
          emitResult(id, true, op, { path:p, bytes:new TextEncoder().encode(files[p]).length, message:'Arquivo escrito.' });
          break;
        }
        case 'fs.read': {
          const p = normalize(cmd.path);
          if (!(p in files)) throw new Error('Arquivo nao encontrado.');
          emitResult(id, true, op, { path:p, content:files[p], message:'Arquivo lido.' });
          break;
        }
        case 'fs.list': {
          emitResult(id, true, op, { files:Object.keys(files), folders:[...folders], message:'Estado do projeto enviado.' });
          break;
        }
        case 'fs.delete': {
          const p = normalize(cmd.path);
          let removed = false;
          if (p in files) { delete files[p]; removed = true; }
          for (const f of [...folders]) if (f === p || f.startsWith(p + '/')) { folders.delete(f); removed = true; }
          for (const f of Object.keys(files)) if (f.startsWith(p + '/')) { delete files[f]; removed = true; }
          if (!removed) throw new Error('Caminho nao encontrado.');
          emitResult(id, true, op, { path:p, message:'Removido.' });
          break;
        }
        case 'fs.rename': {
          const from = normalize(cmd.from), to = normalize(cmd.to);
          if (!safePath(from) || !safePath(to)) throw new Error('Caminho invalido.');
          let changed = false;
          if (from in files) { files[to] = files[from]; delete files[from]; changed = true; }
          for (const f of [...folders]) if (f === from || f.startsWith(from + '/')) { folders.delete(f); folders.add(to + f.slice(from.length)); changed = true; }
          for (const f of Object.keys(files)) if (f.startsWith(from + '/')) { files[to + f.slice(from.length)] = files[f]; delete files[f]; changed = true; }
          if (!changed) throw new Error('Origem nao encontrada.');
          emitResult(id, true, op, { from, to, message:'Renomeado/movido.' });
          break;
        }
        case 'project.status':
          emitResult(id, true, op, { name:projectName, fileCount:Object.keys(files).length, folderCount:folders.size, historyCount:history.length, message:'Estado atual.' });
          break;
        case 'project.export':
          await downloadZip();
          emitResult(id, true, op, { fileCount:Object.keys(files).length, message:'ZIP exportado.' });
          break;
        case 'project.test':
          emitResult(id, true, op, { kind:cmd.kind || 'static', executable:false, checks:runStaticChecks(), message:'Teste estrutural concluido. Execucao nativa requer bridge local.' });
          break;
        case 'ui.status':
          setStatus(String(cmd.text || ''));
          emitResult(id, true, op, { message:'Status atualizado.' });
          break;
        default:
          throw new Error(`Comando desconhecido: ${op}`);
      }
      snapshot();
      updatePanel();
    } catch (error) {
      emitResult(id, false, op, {}, error.message || String(error));
    }
  }

  function parseCommands(text) {
    const re = /===BINGO_CONTROL===\s*([\s\S]*?)\s*===BINGO_END_CONTROL===/gi;
    let m;
    while ((m = re.exec(text))) {
      try {
        const cmd = JSON.parse(m[1].trim());
        if (cmd && typeof cmd === 'object') executeCommand(cmd);
      } catch (_) {}
    }
  }

  function runStaticChecks() {
    const errors = [];
    for (const p of Object.keys(files)) {
      if (!safePath(p)) errors.push(`${p}: caminho invalido`);
      if (typeof files[p] !== 'string') errors.push(`${p}: conteudo invalido`);
    }
    const hasProjectFile = Object.keys(files).some(p => /(^|\/)(project\.godot|package\.json|index\.html|Cargo\.toml|CMakeLists\.txt)$/i.test(p));
    return { errors, warnings:hasProjectFile ? [] : ['Nenhum arquivo principal reconhecido.'], ok:errors.length===0 };
  }

  function crc32(bytes) {
    let c=0xffffffff;
    for (const b of bytes) { c ^= b; for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0); }
    return (c^0xffffffff)>>>0;
  }
  function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}
  function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
  function concat(arrs){let n=arrs.reduce((s,a)=>s+a.length,0),o=new Uint8Array(n),p=0;for(const a of arrs){o.set(a,p);p+=a.length;}return o;}

  async function makeZip(map) {
    const enc=new TextEncoder(), local=[], central=[]; let offset=0;
    for(const [name,text] of Object.entries(map)){
      const nb=enc.encode(name), data=enc.encode(text), crc=crc32(data);
      const lh=concat([new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),nb,data]);
      local.push(lh);
      const ch=concat([new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nb]);
      central.push(ch); offset+=lh.length;
    }
    const cd=concat(central), body=concat(local), end=concat([new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(Object.keys(map).length),u16(Object.keys(map).length),u32(cd.length),u32(body.length),u16(0)]);
    return new Blob([body,cd,end],{type:'application/zip'});
  }

  async function downloadZip() {
    if (!Object.keys(files).length) throw new Error('Projeto sem arquivos.');
    const blob=await makeZip(files), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=(projectName.replace(/[^\w.-]+/g,'_')||'DeepSeek-Project')+'.zip';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
  }

  function createPanel() {
    if (document.getElementById('bingo-build-panel')) return;
    const p=document.createElement('div'); p.id='bingo-build-panel';
    p.innerHTML='<b>🧠 BINGO AGENT v2</b><span id="bingo-status">Inicializando...</span><span id="bingo-count">0 arquivos · 0 pastas</span><button id="bingo-download">Exportar ZIP</button><button id="bingo-reset">Resetar projeto</button>';
    Object.assign(p.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:'#101010',color:'#fff',padding:'14px',borderRadius:'14px',boxShadow:'0 8px 35px #0009',font:'13px Arial',width:'215px',border:'1px solid #333'});
    p.querySelectorAll('span').forEach(s=>Object.assign(s.style,{display:'block',marginTop:'7px',color:'#aaa'}));
    p.querySelectorAll('button').forEach(b=>Object.assign(b.style,{marginTop:'10px',width:'100%',padding:'9px',border:0,borderRadius:'8px',cursor:'pointer'}));
    p.querySelector('#bingo-download').onclick=()=>downloadZip().catch(e=>setStatus(e.message));
    p.querySelector('#bingo-reset').onclick=()=>{files={};folders=new Set();history=[];processed=new Set();snapshot();updatePanel();setStatus('Projeto resetado.');};
    document.documentElement.appendChild(p);
  }
  function setStatus(t){const e=document.getElementById('bingo-status');if(e)e.textContent=t;}
  function updatePanel(){const c=document.getElementById('bingo-count');if(c)c.textContent=`${Object.keys(files).length} arquivos · ${folders.size} pastas`;}

  function watch(){
    if(observer) observer.disconnect();
    observer=new MutationObserver(()=>{
      if(!active)return;
      const body=document.body?.innerText||'';
      if(body!==lastBody){lastBody=body;parseCommands(body);}
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    parseCommands(document.body?.innerText||'');
  }

  chrome.runtime.onMessage.addListener(msg=>{if(msg.type==='START_PROJECT_MODE')startMode();});
})();
