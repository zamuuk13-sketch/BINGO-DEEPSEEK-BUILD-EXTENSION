# Bingo Local Bridge

The bridge is the native local layer for Bingo DeepSeek Build.

## Architecture

DeepSeek -> Chrome extension -> Native Messaging -> `bridge/src/index.js` -> Windows filesystem/processes.

## Current commands

- `project.create`
- `project.status`
- `fs.mkdir`
- `fs.write`
- `fs.read`
- `fs.list`
- `fs.delete`
- `fs.rename`
- `process.run`

Projects are sandboxed below `%USERPROFILE%\\BingoProjects` by default. Override with `BINGO_WORKSPACE` when launching the bridge.

## Protocol

Native Messaging uses a 4-byte little-endian message length followed by UTF-8 JSON.

Every request has an `id` and `op`. Responses contain `protocol`, `id`, `ok`, and operation-specific data.

## Security model

The bridge intentionally does not expose arbitrary filesystem paths. File operations are constrained to the selected project directory. Process execution is disabled unless the command is explicitly sent as `process.run`; the next agent layer should add an allowlist/approval policy before exposing this to an AI agent.

## Installation

Run `install-host.ps1` from PowerShell after the extension ID is known. The generated Native Messaging manifest must contain the real extension origin instead of `EXTENSION_ID_PLACEHOLDER`.

This is the foundation. The next extension layer will connect with `chrome.runtime.connectNative()` and expose the bridge as structured agent tools.
