# BINGO DeepSeek Build

Agente de desenvolvimento para o DeepSeek com execucao local real por uma bridge Python.

## Arquitetura

```text
DeepSeek
   ↓
Chrome Extension
   ↓
Service Worker
   ↓ HTTP localhost
127.0.0.1:8765
   ↓
Python Bridge
   ↓
Windows / Godot / Node / Python / ferramentas permitidas
```

A extensao nao executa comandos diretamente no processo da pagina. O service worker encaminha as tool calls para a Python Bridge local.

## Como iniciar

1. Tenha Python 3.x instalado e disponivel no PATH.
2. Execute `start-bingo-python.bat` na raiz do repositorio.
3. Mantenha a janela do Python Bridge aberta enquanto usar o agente.
4. Abra `http://127.0.0.1:8765/health` no navegador. Deve aparecer um JSON com `ok: true`.
5. No Chrome, abra `chrome://extensions`, ative o modo desenvolvedor e carregue/recarregue a pasta do repositorio como extensao descompactada.
6. Abra o DeepSeek e clique em **Ativar agente** no painel BINGO.

## Ferramentas reais

- `project.create`
- `project.status`
- `fs.mkdir`
- `fs.write`
- `fs.read`
- `fs.list`
- `fs.delete`
- `fs.rename`
- `process.run`

Os projetos ficam, por padrao, em `%USERPROFILE%\\BingoProjects`.

## Protocolo

O agente usa blocos `BINGO_TOOL` e `BINGO_RESULT` para transformar pedidos do DeepSeek em operacoes reais. A regra principal e: o agente so deve afirmar que executou uma operacao depois de receber o respectivo `BINGO_RESULT`.

## Seguranca atual

A bridge escuta somente em `127.0.0.1`, bloqueia caminhos que escapem do diretorio do projeto e possui uma lista de executaveis permitidos para `process.run`. A bridge e destinada ao uso local e deve continuar sendo endurecida antes de ser distribuida para terceiros.
