# BINGO Client

Desktop client do BINGO. Esta é a Etapa 1 (Foundation).

## Executar no Windows

Na raiz do repositório:

```bat
start-bingo-client.bat
```

Ou:

```bat
py -3 -m bingo_client.main
```

## Dependências

Nenhuma biblioteca Python externa é necessária nesta etapa. A interface usa `tkinter`, normalmente distribuído com o Python para Windows.

## O que existe na Etapa 1

- janela desktop independente;
- tema escuro;
- estrutura de workspace;
- seleção e persistência da última pasta;
- Explorer inicial da pasta escolhida;
- painel de status do DeepSeek;
- armazenamento local de configuração em `%APPDATA%\\BingoClient\\config.json`;
- estrutura inicial de permissões para as próximas etapas.

## Próxima etapa

A Etapa 2 conecta o workspace ao gerenciamento real de arquivos e projetos.
