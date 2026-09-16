# BINGO Agent V7 — Planner

V7 adds persistent execution planning on top of V6 memory.

## Planner tools

- `agent.plan.read {project}` — load the current plan.
- `agent.plan.write {project,plan}` — create/replace a plan.
- `agent.plan.update {project,taskId,status,notes,attempts}` — update a task.
- `agent.plan.next {project}` — choose the next pending task whose dependencies are complete and mark it `running`.

## Plan format

```json
{
  "goal": "Build the requested project",
  "status": "active",
  "tasks": [
    {
      "id": "task-1",
      "title": "Inspect the existing project",
      "status": "pending",
      "dependsOn": [],
      "attempts": 0,
      "notes": ""
    }
  ],
  "currentTaskId": null
}
```

Task statuses are `pending`, `running`, `done`, `blocked`, or `cancelled`.

## Autonomous planner loop

1. Load `project.status` and `agent.memory.read`.
2. Load `agent.plan.read`.
3. If there is no useful plan, create a small dependency-aware plan with `agent.plan.write`.
4. Call `agent.plan.next` to select exactly one executable task.
5. Inspect the real files required by that task.
6. Execute the task using the normal BINGO tools.
7. Run a real validation/test with `process.run` whenever the task changes executable code.
8. Mark the task `done` only after the result is actually verified.
9. On failure, increment attempts, record the cause in notes, and retry with a materially different strategy.
10. If a task cannot be safely completed, mark it `blocked` instead of pretending it succeeded.
11. Repeat `agent.plan.next` until the plan is completed or genuinely blocked.
12. Update memory with durable project knowledge at the end.

The planner is persistent in `bingo-agent.json`, so closing the browser does not erase the current plan.

## Important behavior

The planner is a state machine, not a fake checklist. Dependencies are respected, the current task is persisted, and a completed task is not selected again. The model still decides what the task actually requires; the bridge owns the persistent state and transition rules.
