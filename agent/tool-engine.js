(() => {
  'use strict';
  const TOOL_VERSION = 3;
  const tools = {
    'project.create': { description: 'Create a real local project workspace and initialize persistent agent memory.', args: ['name'] },
    'project.status': { description: 'Inspect project, memory and planner status.', args: ['project'] },
    'agent.memory.read': { description: 'Read persistent BINGO agent memory from the project.', args: ['project'] },
    'agent.memory.write': { description: 'Replace persistent BINGO agent memory for the project.', args: ['project', 'memory'] },
    'agent.plan.read': { description: 'Read the persistent execution plan.', args: ['project'] },
    'agent.plan.write': { description: 'Create or replace the persistent execution plan.', args: ['project', 'plan'] },
    'agent.plan.update': { description: 'Update one planner task status, notes or attempts.', args: ['project', 'taskId', 'status', 'notes', 'attempts'] },
    'agent.plan.next': { description: 'Select the next unblocked planner task and mark it running.', args: ['project'] },
    'fs.mkdir': { description: 'Create a directory inside the project.', args: ['project', 'path'] },
    'fs.write': { description: 'Write a UTF-8 file to the local project.', args: ['project', 'path', 'content'] },
    'fs.read': { description: 'Read a UTF-8 local project file.', args: ['project', 'path'] },
    'fs.list': { description: 'List local project files and directories.', args: ['project', 'path'] },
    'fs.delete': { description: 'Delete a local project path.', args: ['project', 'path'] },
    'fs.rename': { description: 'Rename or move a local project path.', args: ['project', 'from', 'to'] },
    'process.run': { description: 'Run an approved executable inside the project.', args: ['project', 'command', 'args', 'cwd'] }
  };

  function validate(tool, args) {
    const schema = tools[tool];
    if (!schema) throw new Error(`Ferramenta desconhecida: ${tool}`);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('args deve ser um objeto.');
    for (const key of schema.args) {
      if (!(key in args) && !['status','notes','attempts'].includes(key)) {
        throw new Error(`Argumento obrigatorio ausente: ${key}`);
      }
    }
  }

  window.BingoAgent = {
    version: TOOL_VERSION,
    listTools() { return structuredClone(tools); },
    call(tool, args = {}) {
      validate(tool, args);
      return new Promise((resolve, reject) => {
        const requestId = `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        chrome.runtime.sendMessage({ type: 'BINGO_TOOL_CALL', requestId, tool, args }, response => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response?.ok) return reject(Object.assign(new Error(response?.error?.message || 'Erro da bridge.'), { detail: response }));
          resolve(response);
        });
      });
    },
    bridge: {
      createProject: name => window.BingoAgent.call('project.create', { name }),
      status: project => window.BingoAgent.call('project.status', { project }),
      readMemory: project => window.BingoAgent.call('agent.memory.read', { project }),
      writeMemory: (project, memory) => window.BingoAgent.call('agent.memory.write', { project, memory }),
      readPlan: project => window.BingoAgent.call('agent.plan.read', { project }),
      writePlan: (project, plan) => window.BingoAgent.call('agent.plan.write', { project, plan }),
      updatePlan: (project, taskId, status, notes = '', attempts = 0) => window.BingoAgent.call('agent.plan.update', { project, taskId, status, notes, attempts }),
      nextTask: project => window.BingoAgent.call('agent.plan.next', { project }),
      mkdir: (project, path) => window.BingoAgent.call('fs.mkdir', { project, path }),
      write: (project, path, content) => window.BingoAgent.call('fs.write', { project, path, content }),
      read: (project, path) => window.BingoAgent.call('fs.read', { project, path }),
      list: (project, path = '') => window.BingoAgent.call('fs.list', { project, path }),
      remove: (project, path) => window.BingoAgent.call('fs.delete', { project, path }),
      rename: (project, from, to) => window.BingoAgent.call('fs.rename', { project, from, to }),
      run: (project, command, args = [], cwd = '') => window.BingoAgent.call('process.run', { project, command, args, cwd })
    }
  };
})();
