/* BINGO V5 desktop relay layer. Loaded after the existing background worker. */
importScripts('../background.js');

const BINGO_DESKTOP = 'http://127.0.0.1:8766';

async function desktopRequest(path, options = {}) {
  const response = await fetch(`${BINGO_DESKTOP}${path}`, {
    ...options,
    headers: {'Content-Type': 'application/json', ...(options.headers || {})}
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `Desktop relay HTTP ${response.status}`);
  return data;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'BINGO_DESKTOP_CONNECT') {
    desktopRequest('/connect', {
      method: 'POST',
      body: JSON.stringify({chat_name: msg.chatName || 'DeepSeek', connection_id: msg.connectionId || `tab-${sender.tab?.id || 'unknown'}`})
    }).then(data => sendResponse(data)).catch(error => sendResponse({ok:false, error:error.message || String(error)}));
    return true;
  }

  if (msg.type === 'BINGO_DESKTOP_STATUS') {
    desktopRequest('/status').then(data => sendResponse(data)).catch(error => sendResponse({ok:false, error:error.message || String(error)}));
    return true;
  }

  if (msg.type === 'BINGO_DESKTOP_POLL') {
    desktopRequest('/outbound').then(data => sendResponse(data)).catch(error => sendResponse({ok:false, error:error.message || String(error)}));
    return true;
  }

  if (msg.type === 'BINGO_DESKTOP_ASSISTANT') {
    desktopRequest('/inbound', {
      method: 'POST',
      body: JSON.stringify({text: msg.text || ''})
    }).then(data => sendResponse(data)).catch(error => sendResponse({ok:false, error:error.message || String(error)}));
    return true;
  }

  if (msg.type === 'BINGO_DESKTOP_DISCONNECT') {
    desktopRequest('/disconnect', {method:'POST', body:'{}'})
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ok:false, error:error.message || String(error)}));
    return true;
  }
});
