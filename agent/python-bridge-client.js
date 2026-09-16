(() => {
  'use strict';

  const BRIDGE_URL = 'http://127.0.0.1:8765';
  const tools = {
    'project.create': ['name'],
    'project.status': ['project'],
    'fs.mkdir': ['project', 'path'],
    'fs.write': ['project', 'path', 'content'],
    'fs.read': ['project', 'path'],
    'fs.list': ['project', 'path'],
    'fs.delete': ['project', 'path'],
    'fs.rename': ['project', 'from', 'to'],
    'process.run': ['project', 'command', 'args', 'cwd']
  };

  async function call(tool, args = {}) {
    if (!tools[tool]) throw new Error(`Ferramenta desconhecida: ${tool}`);
    const response = await fetch(`${BRIDGE_URL}/tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: `bingo-${Date.now()}-${Math.random().toString(16).slice(2)}`, op: tool, ...args })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Erro no Python Bridge');
    return data;
  }

  async function health() {
    const response = await fetch(`${BRIDGE_URL}/health`);
    return response.json();
  }

  window.BingoPythonBridge = { url: BRIDGE_URL, tools, call, health };
})();
