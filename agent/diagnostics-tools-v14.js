/* BINGO Extension Stage 14 — universal diagnostics and system observability tools. */
(() => {
  'use strict';
  const core=globalThis.BingoExtension;
  const registry=globalThis.BingoToolRegistryV11||globalThis.BingoToolRegistry;
  if(!core||!registry)return;
  const VERSION=1,PRODUCT_VERSION='2.18.0';
  const TOOLS=[
    ['diagnostics.snapshot','diagnostics','Obtém o diagnóstico completo do runtime BINGO.',['project']],
    ['diagnostics.health','diagnostics','Verifica a saúde do bridge e do runtime.',['project']],
    ['diagnostics.system','diagnostics','Coleta informações do sistema operacional e hardware básico.',['project']],
    ['diagnostics.cpu','diagnostics','Consulta informações e carga básica de CPU.',['project']],
    ['diagnostics.memory','diagnostics','Consulta memória física disponível e usada.',['project']],
    ['diagnostics.disk','diagnostics','Consulta espaço em disco do workspace.',['project']],
    ['diagnostics.network','diagnostics','Verifica conectividade básica e resolução local.',['project']],
    ['diagnostics.processes','diagnostics','Lista processos do sistema para diagnóstico.',['project']],
    ['diagnostics.python','diagnostics','Consulta o interpretador Python ativo.',['project']],
    ['diagnostics.project','diagnostics','Gera um relatório técnico resumido do projeto.',['project']],
    ['diagnostics.tools','diagnostics','Consulta as ferramentas de diagnóstico disponíveis.',['project']],
    ['diagnostics.report','diagnostics','Combina diagnóstico do sistema, projeto e runtime.',['project']]
  ];
  function registerAll(){for(const [name,category,description,args] of TOOLS)registry.register({name,category,description,args,permission:null,tags:['stage14','diagnostics','observability','health'],source:'stage14',version:VERSION},{replace:true});}
  function capabilities(){return TOOLS.map(([name,category,description,args])=>({name,category,description,args}));}
  registerAll();
  globalThis.BingoDiagnosticsToolsV14=Object.freeze({version:VERSION,productVersion:PRODUCT_VERSION,tools:capabilities,register:registerAll});
  core.log('info','Diagnostics Tools V14 ativo',{tools:TOOLS.length});
})();
