(() => {
  'use strict';
  const TOOL_VERSION = 5;
  const tools = {
    'project.create': { description: 'Create a real local project workspace and initialize persistent agent memory.', args: ['name'] },
    'project.status': { description: 'Inspect project, memory and planner status.', args: ['project'] },
    'agent.memory.read': { description: 'Read persistent BINGO agent memory from the project.', args: ['project'] },
    'agent.memory.write': { description: 'Replace persistent BINGO agent memory for the project.', args: ['project', 'memory'] },
    'agent.plan.read': { description: 'Read the persistent execution plan.', args: ['project'] },
    'agent.plan.write': { description: 'Create or replace the persistent execution plan.', args: ['project', 'plan'] },
    'agent.plan.update': { description: 'Update one planner task status, notes or attempts.', args: ['project', 'taskId', 'status', 'notes', 'attempts'] },
    'agent.plan.next': { description: 'Select the next unblocked planner task and mark it running.', args: ['project'] },
    'agent.verify': { description: 'Run a real project test and return structured diagnostics.', args: ['project', 'command', 'args', 'cwd', 'timeout'] },
    'env.inspect': { description: 'Inspect the local development environment and installed toolchains.', args: ['project'] },
    'project.scan': { description: 'Scan a project and detect files, languages and engines.', args: ['project'] },
    'process.start': { description: 'Start a persistent approved process inside the project.', args: ['project', 'command', 'args', 'cwd'] },
    'process.list': { description: 'List persistent processes started by BINGO.', args: ['project'] },
    'process.stop': { description: 'Stop a persistent BINGO process.', args: ['sessionId', 'force'] },
    'artifact.list': { description: 'List project artifacts with size and modification time.', args: ['project', 'path'] },
    'workspace.snapshot': { description: 'Capture a compact environment, project, plan, test and process snapshot.', args: ['project'] },
    'agent.autonomy.start': { description: 'Start a bounded autonomous project session with a goal and step limit.', args: ['project', 'goal', 'maxSteps'] },
    'agent.autonomy.stop': { description: 'Stop the bounded autonomous project session.', args: ['project'] },
    'agent.autonomy.status': { description: 'Read the current autonomous session state.', args: ['project'] },
    'agent.autonomy.step': { description: 'Record one autonomous decision/action and enforce the session step limit.', args: ['project', 'action'] },
    'agent.batch': { description: 'Execute a bounded sequence of real BINGO operations, stopping at the first failure.', args: ['project', 'operations'] },
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
      if (!(key in args) && !['status','notes','attempts','timeout','cwd','force','goal','maxSteps','action','path','operations','args'].includes(key)) {
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
      verify: (project, command, args = [], cwd = '', timeout = 30) => window.BingoAgent.call('agent.verify', { project, command, args, cwd, timeout }),
      inspectEnvironment: project => window.BingoAgent.call('env.inspect', { project }),
      scanProject: project => window.BingoAgent.call('project.scan', { project }),
      startProcess: (project, command, args = [], cwd = '') => window.BingoAgent.call('process.start', { project, command, args, cwd }),
      listProcesses: project => window.BingoAgent.call('process.list', { project }),
      stopProcess: (sessionId, force = false) => window.BingoAgent.call('process.stop', { sessionId, force }),
      listArtifacts: (project, path = '') => window.BingoAgent.call('artifact.list', { project, path }),
      snapshot: project => window.BingoAgent.call('workspace.snapshot', { project }),
      autonomyStart: (project, goal, maxSteps = 20) => window.BingoAgent.call('agent.autonomy.start', { project, goal, maxSteps }),
      autonomyStop: project => window.BingoAgent.call('agent.autonomy.stop', { project }),
      autonomyStatus: project => window.BingoAgent.call('agent.autonomy.status', { project }),
      autonomyStep: (project, action) => window.BingoAgent.call('agent.autonomy.step', { project, action }),
      batch: (project, operations) => window.BingoAgent.call('agent.batch', { project, operations }),
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
