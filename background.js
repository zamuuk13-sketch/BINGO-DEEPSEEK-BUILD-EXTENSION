const sessions = new Map();
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SAVE_PROJECT') {
    sessions.set(sender.tab?.id, {name: msg.name || 'DeepSeek-Project', files: msg.files || {}});
  }
});
chrome.tabs.onRemoved.addListener(id => sessions.delete(id));
