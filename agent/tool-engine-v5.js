/* BINGO Extension Stage 5 — structured Tool Engine on Protocol V2. */
(() => {
  'use strict';
  const core = globalThis.BingoExtension;
  const protocol = globalThis.BingoProtocolV2;
  if (!core || !protocol) return;

  const TOOLS = Object.freeze({
    'project.create': ['name'], 'project.status': ['project'],
    'agent.memory.read': ['project'], 'agent.memory.write': ['project','memory'],
    'agent.plan.read': ['project'], 'agent.plan.write': ['project','plan'],
    'agent.plan.update': ['project','taskId','status'], 'agent.plan.next': ['project'],
    'agent.verify': ['project','command'], 'env.inspect': ['project'], 'project.scan': ['project'],
    'process.start': ['project','command'], 'process.list': ['project'], 'process.stop': ['sessionId'],
    'artifact.list': ['project'], 'workspace.snapshot': ['project'],
    'agent.autonomy.start': ['project','goal'], 'agent.autonomy.stop': ['project'],
    'agent.autonomy.status': ['project'], 'agent.autonomy.step': ['project','action'],
    'agent.batch': ['project','operations'], 'agent.runtime.status': ['project'],
    'agent.ledger.read': ['project'], 'agent.checkpoint.create': ['project'],
    'agent.checkpoint.list': ['project'], 'agent.session.resume': ['project'], 'agent.health': ['project'],
    'fs.mkdir': ['project','path'], 'fs.write': ['project','path','content'],
    'fs.read': ['project','path'], 'fs.list': ['project'], 'fs.delete': ['project','path'],
    'fs.rename': ['project','from','to'], 'process.run': ['project','command']
  });

  function validate(tool, args) {
    if (!TOOLS[tool]) throw Object.assign(new Error(`Ferramenta desconhecida: ${tool}`), {code:'UNKNOWN_TOOL'});
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw Object.assign(new Error('args deve ser um objeto.'), {code:'INVALID_ARGS'});
    for (const key of TOOLS[tool]) if (!(key in args)) throw Object.assign(new Error(`Argumento obrigatorio ausente: ${key}`), {code:'MISSING_ARG'});
  }

  async function call(tool, args = {}, options = {}) {
    validate(tool, args);
    const request = protocol.create('tool_request', {tool, args}, {tool, meta:{source:'extension-tool-engine', stage:5}});
    request.tool = tool;
    request.args = core.safeClone(args);
    request.payload = {tool, args:core.safeClone(args)};
    const response = await protocol.request((envelope) => new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({type:'BINGO_PROTOCOL_V2', message:envelope}, result => {
        if (chrome.runtime.lastError) return reject(Object.assign(new Error(chrome.runtime.lastError.message), {code:'TRANSPORT_ERROR'}));
        if (!result?.ok) return reject(Object.assign(new Error(result?.error?.message || 'Falha no Tool Engine.'), {detail:result}));
        resolve(result.message || result);
      });
    }), request, options);
    if (!protocol.isValid(response)) throw Object.assign(new Error('Resposta inválida do Protocol V2.'), {code:'INVALID_RESPONSE'});
    if (response.success === false || response.type === 'error') {
      const error = response.error || {};
      throw Object.assign(new Error(error.message || 'Tool falhou.'), {code:error.code || 'TOOL_ERROR', detail:response});
    }
    return response;
  }

  window.BingoToolEngineV5 = Object.freeze({version:5, tools:()=>({...TOOLS}), validate, call, pending:protocol.pending, cancel:protocol.cancel});
  window.BingoAgentV5 = window.BingoToolEngineV5;
  core.log('info','Tool Engine V5 ativo',{protocol:2, tools:Object.keys(TOOLS).length});
})();
