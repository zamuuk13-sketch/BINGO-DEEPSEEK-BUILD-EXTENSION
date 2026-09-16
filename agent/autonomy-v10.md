# BINGO V10 — Truly Autonomous Agent

V10 transforms the V7/V8/V9 toolset into a bounded orchestration layer.

## New capabilities

- `agent.autonomy.start` — starts a project session with a goal and maximum number of decision steps.
- `agent.autonomy.status` — reports whether the session is active and its current step count.
- `agent.autonomy.step` — records a real autonomous decision while enforcing the session limit.
- `agent.autonomy.stop` — explicitly ends the autonomous session.
- `agent.batch` — executes up to 25 real operations sequentially and stops on the first failure.

## Autonomous cycle

`DISCOVER → RECOVER → PLAN → EXECUTE → VERIFY → DIAGNOSE → FIX → VERIFY → RECORD`

V10 is intentionally bounded. It does not create an uncontrolled infinite loop or silently continue forever. The model remains responsible for deciding what the next action should be; BINGO provides the real local tools, state, limits and evidence needed to execute that decision.

## Safety boundaries

- Existing project path sandbox remains active.
- Existing executable allowlist remains active.
- Batch execution is capped at 25 operations.
- Autonomous sessions are capped at 100 steps, with a configurable per-session limit.
- Persistent processes are explicitly tracked by session ID.
- Failed operations stop a batch instead of blindly continuing.
- Verification remains evidence-based; a successful command is not treated as proof that the entire project is correct.
