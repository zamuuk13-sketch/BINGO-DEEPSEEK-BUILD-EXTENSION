/* BINGO Extension Stage 11 — universal tool registry and capability discovery. */
(() => {
  'use strict';

  const core = globalThis.BingoExtension;
  if (!core) return;

  const VERSION = 1;
  const PRODUCT_VERSION = '2.11.0';
  const MAX_TOOLS = 1000;
  const registry = new Map();

  const BUILT_INS = [
    ['project.create','project','Cria um novo projeto.', ['name']],
    ['project.status','project','Consulta o estado do projeto.', ['project']],
    ['project.scan','project','Escaneia a estrutura do projeto.', ['project']],
    ['workspace.snapshot','project','Cria um snapshot resumido do workspace.', ['project']],
    ['fs.mkdir','filesystem','Cria uma pasta dentro do workspace.', ['project','path']],
    ['fs.write','filesystem','Cria ou substitui um arquivo.', ['project','path','content']],
    ['fs.read','filesystem','Lê um arquivo.', ['project','path']],
    ['fs.list','filesystem','Lista arquivos e pastas.', ['project']],
    ['fs.delete','filesystem','Exclui um arquivo ou pasta.', ['project','path']],
    ['fs.rename','filesystem','Renomeia ou move um item.', ['project','from','to']],
    ['process.run','terminal','Executa um comando e aguarda o resultado.', ['project','command']],
    ['process.start','terminal','Inicia um processo persistente.', ['project','command']],
    ['process.list','terminal','Lista processos BINGO ativos.', ['project']],
    ['process.stop','terminal','Encerra um processo BINGO.', ['sessionId']],
    ['env.inspect','system','Inspeciona o ambiente de desenvolvimento.', ['project']],
    ['artifact.list','system','Lista artefatos gerados pelo projeto.', ['project']],
    ['agent.memory.read','agent','Lê a memória persistente do agente.', ['project']],
    ['agent.memory.write','agent','Atualiza a memória persistente do agente.', ['project','memory']],
    ['agent.plan.read','agent','Lê o plano atual.', ['project']],
    ['agent.plan.write','agent','Substitui o plano atual.', ['project','plan']],
    ['agent.plan.update','agent','Atualiza uma tarefa do plano.', ['project','taskId','status']],
    ['agent.plan.next','agent','Obtém a próxima tarefa executável.', ['project']],
    ['agent.verify','testing','Executa verificação do projeto.', ['project','command']],
    ['agent.health','diagnostics','Consulta a saúde do runtime.', ['project']],
    ['agent.runtime.status','diagnostics','Consulta o runtime do agente.', ['project']],
    ['agent.ledger.read','diagnostics','Lê o ledger de execução.', ['project']],
    ['agent.checkpoint.create','agent','Cria um checkpoint.', ['project']],
    ['agent.checkpoint.list','agent','Lista checkpoints.', ['project']],
    ['agent.session.resume','agent','Retoma uma sessão anterior.', ['project']],
    ['agent.autonomy.start','agent','Inicia autonomia limitada.', ['project','goal']],
    ['agent.autonomy.stop','agent','Para a autonomia.', ['project']],
    ['agent.autonomy.status','agent','Consulta a autonomia.', ['project']],
    ['agent.autonomy.step','agent','Executa um passo de autonomia.', ['project','action']],
    ['agent.batch','agent','Executa várias operações em lote.', ['project','operations']]
  ];

  const CATEGORY_ALIASES = Object.freeze({
    fs:'filesystem', file:'filesystem', files:'filesystem',
    shell:'terminal', cmd:'terminal', command:'terminal', process:'terminal',
    os:'system', pc:'system', computer:'computer',
    ai:'agent', runtime:'agent', test:'testing', debug:'diagnostics'
  });

  function normalizeCategory(category) {
    const value = String(category || 'general').trim().toLowerCase();
    return CATEGORY_ALIASES[value] || value;
  }

  function normalizeName(name) {
    const value = String(name || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
      throw Object.assign(new Error('Nome de ferramenta inválido.'), {code:'INVALID_TOOL_NAME'});
    }
    return value;
  }

  function clone(value) { return core.safeClone(value); }

  function validateDefinition(definition) {
    if (!definition || typeof definition !== 'object') throw new Error('Definição da ferramenta inválida.');
    const name = normalizeName(definition.name);
    if (!definition.description) throw new Error('A ferramenta precisa de description.');
    const args = Array.isArray(definition.args) ? definition.args : [];
    for (const arg of args) {
      if (typeof arg !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(arg)) {
        throw new Error(`Argumento inválido na ferramenta ${name}.`);
      }
    }
    return {name, description:String(definition.description), category:normalizeCategory(definition.category), args:[...new Set(args)], permission:definition.permission || null, tags:Array.isArray(definition.tags) ? [...new Set(definition.tags.map(String))] : [], source:String(definition.source || 'builtin'), version:Number(definition.version || 1)};
  }

  function register(definition, options = {}) {
    const item = validateDefinition(definition);
    if (registry.has(item.name) && !options.replace) throw Object.assign(new Error(`Ferramenta já registrada: ${item.name}`), {code:'TOOL_EXISTS'});
    if (!registry.has(item.name) && registry.size >= MAX_TOOLS) throw Object.assign(new Error('Limite de ferramentas atingido.'), {code:'REGISTRY_LIMIT'});
    registry.set(item.name, item);
    core.log('info','Ferramenta registrada',{name:item.name,category:item.category,source:item.source});
    return clone(item);
  }

  function unregister(name) {
    return registry.delete(normalizeName(name));
  }

  function get(name) {
    const item = registry.get(normalizeName(name));
    return item ? clone(item) : null;
  }

  function has(name) {
    try { return registry.has(normalizeName(name)); } catch { return false; }
  }

  function list(category = '') {
    const wanted = category ? normalizeCategory(category) : '';
    return [...registry.values()]
      .filter(item => !wanted || item.category === wanted)
      .sort((a,b) => a.name.localeCompare(b.name))
      .map(clone);
  }

  function search(query = '', options = {}) {
    const text = String(query || '').trim().toLowerCase();
    const category = options.category ? normalizeCategory(options.category) : '';
    const limit = Math.min(Math.max(Number(options.limit || 50), 1), 200);
    return [...registry.values()]
      .filter(item => !category || item.category === category)
      .map(item => {
        if (!text) return {item,score:0};
        const haystack = `${item.name} ${item.description} ${item.category} ${item.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(text)) return null;
        let score = item.name === text ? 100 : item.name.startsWith(text) ? 80 : item.category === text ? 60 : haystack.includes(text) ? 20 : 0;
        return {item,score};
      })
      .filter(Boolean)
      .sort((a,b) => b.score-a.score || a.item.name.localeCompare(b.item.name))
      .slice(0,limit)
      .map(({item,score}) => ({...clone(item),score}));
  }

  function categories() {
    const counts = {};
    for (const item of registry.values()) counts[item.category] = (counts[item.category] || 0) + 1;
    return Object.keys(counts).sort().map(name => ({name,count:counts[name]}));
  }

  function capabilities() {
    return {version:VERSION,productVersion:PRODUCT_VERSION,maxTools:MAX_TOOLS,total:registry.size,categories:categories(),tools:list()};
  }

  function clearDynamic() {
    for (const [name,item] of registry) if (item.source !== 'builtin') registry.delete(name);
    return registry.size;
  }

  for (const [name,category,description,args] of BUILT_INS) {
    register({name,category,description,args,source:'builtin',version:1});
  }

  const api = Object.freeze({
    version:VERSION,
    productVersion:PRODUCT_VERSION,
    maxTools:MAX_TOOLS,
    register,
    unregister,
    get,
    has,
    list,
    search,
    categories,
    capabilities,
    clearDynamic
  });

  globalThis.BingoToolRegistryV11 = api;
  globalThis.BingoToolRegistry = api;
  core.log('info','Tool Registry V11 ativo',{tools:registry.size,categories:categories().length});
})();
