const status = document.getElementById('status');
document.getElementById('start').addEventListener('click', async () => {
  status.textContent = 'Preparando o DeepSeek...';
  const tabs = await chrome.tabs.query({active:true,currentWindow:true});
  const tab = tabs[0];
  if (!tab || !/^https:\/\/(chat\.)?deepseek\.com\//.test(tab.url || '')) {
    status.textContent = 'Abra o DeepSeek primeiro.';
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, {type:'START_PROJECT_MODE'});
    window.close();
  } catch (e) {
    status.textContent = 'Recarregue a página do DeepSeek e tente novamente.';
  }
});

document.getElementById('diagnostics').addEventListener('click', async () => {
  await chrome.tabs.create({url: chrome.runtime.getURL('diagnostics.html')});
  window.close();
});
