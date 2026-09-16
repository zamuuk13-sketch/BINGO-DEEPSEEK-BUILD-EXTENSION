# BINGO Agent V8 — Verifier / Debugger

V8 adds a verification layer between execution and the next agent decision.

## What it does

Every `process.run` result is automatically inspected by the extension. The verifier classifies common failures such as:

- syntax/parse errors;
- missing imports/modules;
- missing files/paths;
- permission errors;
- type/reference errors;
- Godot parser/runtime errors;
- compiler/linker failures;
- runtime exceptions/crashes.

The result contains:

- `status`: `passed`, `warning`, or `failed`;
- `category`: normalized failure category;
- `summary`: short diagnostic explanation;
- `evidence`: the final relevant output lines;
- command, cwd and exit code.

## Explicit verifier tool

```text
===BINGO_TOOL===
{"id":"verify-1","tool":"agent.verify","args":{"project":"Demo","command":"godot","args":["--headless","--path","."],"cwd":"","timeout":30}}
===BINGO_END_TOOL===
```

`agent.verify` executes the real test through the Python bridge and returns the structured diagnostic.

## Autonomous debug loop

The intended V8 cycle is:

`PLAN -> MODIFY -> VERIFY -> DIAGNOSE -> READ RELEVANT FILE -> FIX -> VERIFY`

The verifier does not claim that a project is correct merely because `exitCode` is zero. A successful process is only considered `passed` when no known failure signature is detected.

V8 is diagnostic assistance, not a magical proof of correctness. The agent must still inspect source files and reproduce failures before making fixes.
