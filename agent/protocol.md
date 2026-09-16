# BINGO Agent Protocol v1

The agent layer turns the DeepSeek conversation into a tool-using development agent.

## Tool request

```text
===BINGO_TOOL===
{"id":"req-1","tool":"fs.write","args":{"project":"Demo","path":"main.gd","content":"..."}}
===BINGO_END_TOOL===
```

## Tool result

```text
===BINGO_RESULT===
{"id":"req-1","ok":true,"tool":"fs.write","result":{"bytes":123}}
===BINGO_END_RESULT===
```

## Available tools

- `project.create`
- `project.status`
- `fs.mkdir`
- `fs.write`
- `fs.read`
- `fs.list`
- `fs.delete`
- `fs.rename`
- `process.run`

The extension owns the protocol parser and dispatches local operations through Native Messaging. The model never receives direct operating-system access; every operation is translated into a defined tool call.

## Agent loop

1. Model emits a tool request.
2. Extension validates the request and arguments.
3. Extension calls the local bridge.
4. Bridge executes inside the project sandbox.
5. Bridge returns structured JSON.
6. Extension injects the result into the conversation.
7. Model continues from the actual result.

This enables iterative build/test/fix loops rather than one-shot file generation.
