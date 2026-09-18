/* BINGO Extension Stage 15 — Package & Dependency Manager. */
(() => {
  'use strict';
  const core = globalThis.BingoExtension;
  const registry = globalThis.BingoToolRegistryV11 || globalThis.BingoToolRegistry;
  if (!core || !registry) return;

  const VERSION = 1;
  const PRODUCT_VERSION = '2.19.0';

  const TOOLS = [
    ['package.detect','package','Detecta gerenciadores de pacotes e ferramentas instaladas.',['project'],'diagnostics'],
    ['package.managers','package','Lista gerenciadores de pacotes suportados.',['project'],null],
    ['package.list','package','Lista dependências declaradas no projeto.',['project'],null],
    ['package.check','package','Valida se as dependências declaradas estão instaladas.',['project'],null],
    ['package.outdated','package','Consulta dependências desatualizadas sem instalar nada.',['project'],null],
    ['package.install','package','Instala uma ou mais dependências usando o gerenciador detectado.',['project','manager','packages'],'installation'],
    ['package.uninstall','package','Remove dependências usando o gerenciador selecionado.',['project','manager','packages'],'installation'],
    ['package.update','package','Atualiza dependências usando o gerenciador selecionado.',['project','manager','packages'],'installation'],
    ['package.run','package','Executa um comando de script do gerenciador.',['project','manager','script'],'terminal'],
    ['package.python.pip','package','Executa uma operação controlada do pip.',['project','action','packages'],'installation'],
    ['package.node.npm','package','Executa uma operação controlada do npm.',['project','action','packages'],'installation'],
    ['package.node.npx','package','Executa um pacote via npx.',['project','command'],'terminal'],
    ['package.cargo','package','Executa uma operação controlada do Cargo.',['project','action','packages'],'installation'],
    ['package.cmake','package','Detecta o CMake e consulta sua versão.',['project'],'diagnostics'],
    ['package.mingw','package','Detecta GCC/G++/MinGW disponíveis no sistema.',['project'],'diagnostics'],
    ['package.godot','package','Detecta o executável Godot e consulta sua versão.',['project'],'diagnostics']
  ];

  for (const [name,category,description,args,permission] of TOOLS) {
    try {
      registry.register({name,category,description,args,permission,source:'stage15',version:VERSION,tags:['package','dependency','stage15']},{replace:true});
    } catch (error) {
      core.log('error','Falha ao registrar ferramenta Stage 15',{name,error:String(error)});
    }
  }

  globalThis.BingoPackageToolsV15 = Object.freeze({
    version: VERSION, productVersion: PRODUCT_VERSION,
    tools: TOOLS.map(([name]) => name)
  });
  core.log('info','Package Tools V15 ativo',{tools:TOOLS.length});
})();