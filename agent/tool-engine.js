(() => {
  const TOOL_VERSION = 1;
  const pending = new Map();
  let sequence = 0;
  let port = null;

  const tools = {
    'project.create': { description: 'Create a project workspace.', args: ['name'], local: true },
    'project.status': { description: 'Inspect project workspace status.', args: ['project'], local: true },
    'fs.mkdir': { description: 'Create a directory inside the project.', args: ['project', 'path'], local: true },
    'fs.write': { description: 'Write a UTF-8 project file.', args: ['project', 'path', 'content'], local: true },
    'fs.read': { description: 'Read a UTF-8 project file.', args: ['project', 'path'], local: true },
    'fs.list': { description: 'List a project directory.', args: ['project', 'path'], local: true },
    'fs.delete': { description: 'Delete a project file or directory.', args: ['project', 'path'], local: true },
    'fs.rename': { description: 'Rename a project path.', args: ['project', 'from', 'to'], local: true },
    'process.run': { description: 'Run an approved local process inside a project.', args: ['project', 'command', 'args', 'cwd'], local: true }
  };

  function connect() {
    if (port) return port;
    try {
      port = chrome.runtime.connectNative('com.bingo.deepseek.build');
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(() => {
        for (const [, p] of pending) p.reject(new Error('Bingo bridge desconectado'));
        pending.clear();
        port = null;
      });
    } catch (error) {
      port = null;
      throw error;
    }
    return port;
  }

  function onMessage(message) {
    if (message?.id && pending.has(message.id)) {
      const p = pending.get(message.id);
      pending.delete(message.id);
      message.ok ? p.resolve(message) : p.reject(Object.assign(new Error(message.error?.message || 'Bridge error'), { detail: message }));
      return;
    }
    window.postMessage({ source: 'BINGO_AGENT', type: 'BRIDGE_EVENT', payload: message }, '*');
  }

  function call(op, payload = {}) {
    const id = `bingo-${Date.now()}-${++sequence}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        connect().postMessage({ protocol: TOOL_VERSION, id, op, ...payload });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  window.BingoAgent = {
    version: TOOL_VERSION,
    listTools() { return structuredClone(tools); },
    call,
    isConnected() { return !!port; },
    disconnect() { if (port) port.disconnect(); },
    bridge: {
      createProject: name => call('project.create', { name }),
      status: project => call('project.status', { project }),
      mkdir: (project, path) => call('fs.mkdir', { project, path }),
      write: (project, path, content) => call('fs.write', { project, path, content }),
      read: (project, path) => call('fs.read', { project, path }),
      list: (project, path = '') => call('fs.list', { project, path }),
      remove: (project, path) => call('fs.delete', { project, path }),
      rename: (project, from, to) => call('fs.rename', { project, from, to }),
      run: (project, command, args = [], cwd = '') => call('process.run', { project, command, args, cwd })
    }
  };
})();
