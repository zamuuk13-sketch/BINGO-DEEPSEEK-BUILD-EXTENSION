(() => {
  const $ = id => document.getElementById(id);
  const metrics = $('metrics');

  function tabSend(message) {
    return chrome.tabs.query({active:true,currentWindow:true}).then(tabs => {
      const tab = tabs[0];
      if (!tab?.id) throw new Error('Aba ativa não encontrada.');
      return chrome.tabs.sendMessage(tab.id, message);
    });
  }

  function card(label, value, cls='') { return `<div class="card"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`; }
  function esc(value) { return String(value ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  async function snapshot() {
    try {
      const result = await tabSend({type:'BINGO_DIAGNOSTICS_SNAPSHOT'});
      if (!result?.ok) throw new Error(result?.error || 'Diagnostics indisponível.');
      render(result.snapshot);
    } catch (error) {
      metrics.innerHTML = card('Status', 'Indisponível', 'bad');
      $('connections').textContent = error.message || String(error);
    }
  }

  function render(data) {
    metrics.innerHTML = [
      card('DeepSeek', esc(data.deepseek), data.deepseek === 'connected' ? 'ok' : 'warn'),
      card('Desktop', esc(data.desktop), data.desktop === 'connected' ? 'ok' : 'warn'),
      card('Protocolo', `V${esc(data.protocol)}`),
      card('Sessão', esc(data.sessionId || '—')),
      card('Requests', data.requests),
      card('Sucesso', data.successful, 'ok'),
      card('Falhas', data.failed, data.failed ? 'bad' : 'ok'),
      card('Latência', `${data.latencyMs} ms`),
      card('Retries', data.retries),
      card('Pendentes', data.pending),
      card('Eventos', data.recentEvents?.length || 0),
      card('Erros', data.errors?.length || 0, data.errors?.length ? 'bad' : 'ok')
    ].join('');

    $('connections').textContent = JSON.stringify({
      deepseek:data.deepseek,
      desktop:data.desktop,
      protocol:data.protocol,
      sessionId:data.sessionId,
      transport:data.transport,
      performance:data.performance ? {running:data.performance.running,scans:data.performance.scans,mutations:data.performance.mutations,dropped:data.performance.dropped} : null,
      security:data.security ? {accepted:data.security.accepted,rejected:data.security.rejected,maxPayload:data.security.maxPayload} : null,
      continuity:data.continuity,
      autonomy:data.autonomy
    }, null, 2);
    $('errors').textContent = data.errors?.length ? JSON.stringify(data.errors, null, 2) : 'Nenhum erro registrado.';
    $('events').textContent = data.recentEvents?.length ? JSON.stringify(data.recentEvents, null, 2) : 'Nenhum evento registrado.';
  }

  $('refresh').onclick = snapshot;
  $('export').onclick = async () => { try { await tabSend({type:'BINGO_DIAGNOSTICS_EXPORT'}); } catch (e) { alert(e.message || e); } };
  $('test').onclick = async () => { try { const r = await tabSend({type:'BINGO_DIAGNOSTICS_TEST'}); alert(JSON.stringify(r?.result || r, null, 2)); await snapshot(); } catch (e) { alert(e.message || e); } };
  $('clear').onclick = async () => { try { await tabSend({type:'BINGO_DIAGNOSTICS_CLEAR'}); await snapshot(); } catch (e) { alert(e.message || e); } };
  snapshot();
})();
