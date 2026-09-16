(() => {
  const CONFIG_PROMPT = `Você está no modo BINGO DEEPSEEK BUILD. Continue usando o chat normalmente e converse naturalmente com o usuário. Quando o usuário pedir um projeto, crie o projeto completo e funcional, não apenas exemplos. Sempre que precisar entregar arquivos, use EXATAMENTE este formato para cada arquivo:\n\n===BINGO_FILE: caminho/relativo/do/arquivo ===\n<conteúdo integral do arquivo>\n===BINGO_END_FILE===\n\nVocê pode entregar quantos arquivos forem necessários. Preserve pastas e nomes. No final, inclua uma linha ===BINGO_PROJECT: NomeDoProjeto===. Não coloque esses marcadores dentro de blocos de código. Depois dos arquivos, explique normalmente o que foi criado. A extensão reconstruirá os arquivos e oferecerá o ZIP ao usuário.`;

  let active = false;
  let lastText = '';
  let files = {};
  let projectName = 'DeepSeek-Project';
  let observer;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function findComposer() {
    return document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
  }

  function setComposer(el, text) {
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', {bubbles:true}));
    } else {
      el.focus();
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:text}));
    }
  }

  function submitComposer(el) {
    const form = el.closest('form');
    if (form) { form.requestSubmit(); return true; }
    const btn = [...document.querySelectorAll('button')].find(b => {
      const t = (b.getAttribute('aria-label') || b.title || b.innerText || '').toLowerCase();
      return /send|enviar|submit/.test(t) && !b.disabled;
    });
    if (btn) { btn.click(); return true; }
    el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
    return true;
  }

  async function startMode() {
    active = true;
    files = {};
    createPanel();
    // Tenta iniciar uma conversa nova pelo botão visível. Se não encontrar, usa a conversa atual.
    const newChat = [...document.querySelectorAll('button,a')].find(e => {
      const t = (e.getAttribute('aria-label') || e.title || e.innerText || '').toLowerCase().trim();
      return /new chat|new conversation|nova conversa|novo chat/.test(t);
    });
    if (newChat) { newChat.click(); await sleep(900); }
    const composer = findComposer();
    if (!composer) { setStatus('Não encontrei a caixa de mensagem. Recarregue o DeepSeek.'); return; }
    setComposer(composer, CONFIG_PROMPT);
    submitComposer(composer);
    setStatus('Modo projeto ativo ✓');
    watch();
  }

  function parse(text) {
    const project = text.match(/===BINGO_PROJECT:\s*(.*?)===/i);
    if (project) projectName = project[1].trim() || projectName;
    const re = /===BINGO_FILE:\s*([^=\n]+?)\s*===\s*\n([\s\S]*?)\n===BINGO_END_FILE===/gi;
    let m, count=0;
    while ((m = re.exec(text))) {
      const path = m[1].trim().replace(/^\/+/, '').replace(/\\/g,'/');
      if (path && !path.includes('..')) { files[path] = m[2]; count++; }
    }
    if (count) { updatePanel(Object.keys(files).length); chrome.runtime.sendMessage({type:'SAVE_PROJECT',name:projectName,files}); }
  }

  function watch() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (!active) return;
      const body = document.body?.innerText || '';
      if (body !== lastText) { lastText = body; parse(body); }
    });
    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
    parse(document.body?.innerText || '');
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
    const enc = new TextEncoder(), local=[], central=[]; let offset=0;
    for (const [name,text] of Object.entries(map)) {
      const nb=enc.encode(name), data=enc.encode(text), crc=crc32(data);
      const lh=concat([new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),nb,data]);
      local.push(lh);
      const ch=concat([new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nb]);
      central.push(ch); offset += lh.length;
    }
    const cd=concat(central), body=concat(local), end=concat([new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(Object.keys(map).length),u16(Object.keys(map).length),u32(cd.length),u32(body.length),u16(0)]);
    return new Blob([body,cd,end],{type:'application/zip'});
  }

  function createPanel() {
    if (document.getElementById('bingo-build-panel')) return;
    const p=document.createElement('div'); p.id='bingo-build-panel';
    p.innerHTML='<b>📦 Bingo Build</b><span id="bingo-status">Ativando...</span><span id="bingo-count">0 arquivos</span><button id="bingo-download" disabled>Baixar ZIP</button>';
    Object.assign(p.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:'#111',color:'#fff',padding:'14px',borderRadius:'12px',boxShadow:'0 8px 30px #0008',font:'13px Arial',width:'190px'});
    p.querySelectorAll('span').forEach(s=>Object.assign(s.style,{display:'block',marginTop:'6px',color:'#aaa'}));
    const b=p.querySelector('button'); Object.assign(b.style,{marginTop:'10px',width:'100%',padding:'9px',border:0,borderRadius:'8px',cursor:'pointer'});
    b.onclick=async()=>{if(!Object.keys(files).length)return; b.disabled=true;b.textContent='Gerando...';const blob=await makeZip(files);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=projectName.replace(/[^\w.-]+/g,'_')+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);b.textContent='Baixar ZIP';b.disabled=false;};
    document.documentElement.appendChild(p);
  }
  function setStatus(t){const e=document.getElementById('bingo-status');if(e)e.textContent=t;}
  function updatePanel(n){const c=document.getElementById('bingo-count'),b=document.getElementById('bingo-download');if(c)c.textContent=n+' arquivo(s) detectado(s)';if(b)b.disabled=!n;setStatus('Projeto sendo acompanhado ✓');}

  chrome.runtime.onMessage.addListener(msg => { if (msg.type === 'START_PROJECT_MODE') startMode(); });
})();
