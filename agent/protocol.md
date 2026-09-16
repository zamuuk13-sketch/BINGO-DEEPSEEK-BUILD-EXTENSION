# BINGO Agent Protocol v6

The agent layer turns the DeepSeek conversation into a real local development agent with persistent project memory.

## Tool request

```text
===BINGO_TOOL===
{"id":"req-1","tool":"fs.write","args":{"project":"Demo","path":"main.gd","content":"..."}}
===BINGO_END_TOOL===
```

## Tool result

```text
===BINGO_RESULT===
{"protocol":"BINGO_AGENT_V6","id":"req-1","ok":true,"tool":"fs.write","result":{"bytes":123}}
===BINGO_END_RESULT===
```

## Available tools

- `project.create`
- `project.status`
- `agent.memory.read`
- `agent.memory.write`
- `fs.mkdir`
- `fs.write`
- `fs.read`
- `fs.list`
- `fs.delete`
- `fs.rename`
- `process.run`

## Persistent memory

Every project has a `bingo-agent.json` file at its root. The Python bridge initializes it automatically and records relevant tool activity, tests, and errors without storing full source files in the history.

The memory can also be explicitly read or replaced with `agent.memory.read` and `agent.memory.write`. It contains:

- current project context;
- completed tasks;
- pending tasks;
- known errors;
- test results;
- bounded tool history.

The memory survives closing DeepSeek, the browser, and the extension because it is stored in the local project directory.

## Agent loop

1. Model emits a tool request.
2. Extension validates the request and arguments.
3. Extension calls the local Python bridge.
4. Bridge executes inside the project sandbox.
5. Bridge records relevant persistent state.
6. Bridge returns structured JSON.
7. Extension injects the result into the conversation.
8. Model continues from the actual result.

For an existing project, the recommended startup sequence is:

`project.status -> agent.memory.read -> fs.list -> fs.read -> modify -> process.run -> agent.memory.write`

This enables iterative build/test/fix loops that can continue across separate DeepSeek sessions.
