/* BINGO Extension Stage 13 — advanced terminal, command discovery and process control. */
(() => {
  'use strict';
  const core=globalThis.BingoExtension;
  const registry=globalThis.BingoToolRegistryV11||globalThis.BingoToolRegistry;
  if(!core||!registry)return;
  const VERSION=1,PRODUCT_VERSION='2.17.0';
  const TOOLS=[
    ['terminal.run','terminal','Executa um comando no workspace e aguarda a conclusão.',['project','command']],
    ['terminal.start','terminal','Inicia um processo persistente no workspace.',['project','command']],
    ['terminal.stop','terminal','Encerra um processo iniciado pelo BINGO.',['sessionId']],
    ['terminal.list','terminal','Lista processos persistentes do BINGO.',['project']],
    ['terminal.which','system','Descobre o caminho de um executável disponível no PATH.',['name']],
    ['terminal.env','system','Consulta variáveis de ambiente do processo BINGO.',['project']],
    ['terminal.cwd','terminal','Consulta o diretório de trabalho do projeto.',['project']],
    ['terminal.shells','system','Lista shells comuns disponíveis no sistema.',['project']],
    ['terminal.command_exists','system','Verifica se um comando existe no ambiente.',['name']],
    ['terminal.version','system','Obtém a versão de uma ferramenta de linha de comando.',['name','project']],
    ['terminal.kill_tree','terminal','Encerra um processo e seus descendentes.',['sessionId']],
    ['terminal.run_script','terminal','Executa um script .py ou .js do projeto.',['project','path']],
    ['terminal.capture','terminal','Executa um comando e retorna saída estruturada.',['project','command']],
    ['terminal.pipe','terminal','Executa uma sequência controlada de comandos.',['project','commands']]
  ];
  function registerAll(){for(const [name,category,description,args] of TOOLS)registry.register({name,category,description,args,permission:category==='terminal'?'terminal':null,tags:['stage13','terminal','shell','process'],source:'stage13',version:VERSION},{replace:true});}
  function capabilities(){return TOOLS.map(([name,category,description,args])=>({name,category,description,args}));}
  registerAll();
  globalThis.BingoTerminalToolsV13=Object.freeze({version:VERSION,productVersion:PRODUCT_VERSION,tools:capabilities,register:registerAll});
  core.log('info','Terminal Tools V13 ativo',{tools:TOOLS.length});
})();
