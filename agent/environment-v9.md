# BINGO Environment V9

V9 adds operational awareness to the V7 planner + V8 verifier architecture.

## New tools

- `env.inspect` — detects OS, Python and approved local toolchains.
- `project.scan` — recursively scans a project and identifies files, extensions and common engines/framework markers.
- `process.start` — starts an approved long-running development process and returns a managed `sessionId`.
- `process.list` — lists BINGO-managed processes and their current state.
- `process.stop` — terminates a managed process by `sessionId`.
- `artifact.list` — lists project artifacts with size and modification time.
- `workspace.snapshot` — captures environment, project scan summary, plan, recent tests, diagnostics and managed processes.

## Autonomous V9 loop

`ENV INSPECT -> PROJECT SCAN -> PLAN -> MODIFY -> START/RUN -> VERIFY -> DIAGNOSE -> FIX -> VERIFY -> SNAPSHOT`

The agent should verify process state instead of assuming that a server, watcher or playtest is still running. Long-lived processes remain constrained by the same executable allowlist and project path sandbox used by the Python bridge.

V9 is environment/session awareness; it does not claim that a successful process exit proves application correctness.
