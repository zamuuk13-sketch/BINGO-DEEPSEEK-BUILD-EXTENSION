# BINGO V11 — Production Runtime

V11 is the production layer over V7 Planner, V8 Verifier, V9 Environment and V10 Autonomy.

## Durable runtime

Runtime state is stored per project in `.bingo/v11-runtime.json` and contains:

- autonomous session state;
- execution ledger;
- checkpoints;
- last runtime update.

## Tools

- `agent.health`
- `agent.runtime.status`
- `agent.session.resume`
- `agent.checkpoint.create`
- `agent.checkpoint.list`
- `agent.ledger.read`
- `agent.autonomy.start` with resume support
- `agent.autonomy.step`
- `agent.autonomy.stop`

## Production loop

`DISCOVER -> RESUME -> PLAN -> MODIFY -> RUN -> VERIFY -> DIAGNOSE -> FIX -> CHECKPOINT -> CONTINUE -> FINAL VERIFY`

The runtime remains bounded: V10 autonomy limits still apply, batches remain limited, process execution remains allowlisted, and project paths remain sandboxed by the underlying bridge.

V11 also uses its own HTTP dispatcher so V11 operations are actually routed through the production runtime instead of relying on the base bridge handler's module-global `execute` function.
