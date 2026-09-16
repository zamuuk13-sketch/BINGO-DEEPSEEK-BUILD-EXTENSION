# BINGO Agent Protocol v7

V7 adds a persistent dependency-aware planner to the V6 local agent architecture.

## Tool request

```text
===BINGO_TOOL===
{"id":"req-1","tool":"agent.plan.next","args":{"project":"Demo"}}
===BINGO_END_TOOL===
```

## Tool result

```text
===BINGO_RESULT===
{"protocol":"BINGO_AGENT_V7","id":"req-1","ok":true,"tool":"agent.plan.next","result":{"task":{}}}
===BINGO_END_RESULT===
```

## Available tools

- `project.create`
- `project.status`
- `agent.memory.read`
- `agent.memory.write`
- `agent.plan.read`
- `agent.plan.write`
- `agent.plan.update`
- `agent.plan.next`
- `fs.mkdir`
- `fs.write`
- `fs.read`
- `fs.list`
- `fs.delete`
- `fs.rename`
- `process.run`

## Persistent planner

Every project keeps its plan inside `bingo-agent.json`. V7 extends the V6 memory format with:

- `plan.goal` — the requested outcome;
- `plan.status` — `idle`, `active`, or `completed`;
- `plan.tasks` — dependency-aware tasks;
- `plan.currentTaskId` — the task currently being executed.

Each task has an id, title, status, dependency list, attempt count and notes. `agent.plan.next` selects a pending task only when every dependency is complete and marks it `running`.

## Agent loop

1. Load project status and persistent memory.
2. Load the persistent plan.
3. Create a concise plan when one does not exist.
4. Select the next unblocked task with `agent.plan.next`.
5. Inspect the real files required by that task.
6. Modify the project using real BINGO tools.
7. Validate changes with `process.run` when appropriate.
8. Mark the task `done` only after actual verification.
9. On failure, record the attempt and change strategy before retrying.
10. Continue selecting tasks until the plan is completed or a task is genuinely blocked.
11. Persist durable context in memory.

The planner is persistent across browser, extension and DeepSeek sessions. It is a state machine backed by the local Python bridge rather than a visual checklist.
