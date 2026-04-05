# V2 Terminal Env Review

Last reviewed: 2026-04-04

## Scope

This note is about the current checked-out v2 workspace terminal only.

Relevant files:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`
- `packages/host-service/src/terminal/terminal.ts`

## Current V2

Today, the checked-out v2 terminal path is still workspace-scoped, not terminal-scoped:

- `TerminalPaneData` stores `terminalId`
- the pane registry renders `TerminalPane` with only `workspaceId`
- `TerminalPane` connects to `/terminal/${workspaceId}`
- host-service exposes `GET /terminal/:workspaceId`
- each websocket creates a fresh PTY and closing the socket kills it

Current PTY env:

```ts
{
  ...process.env,
  TERM: "xterm-256color",
  COLORTERM: "truecolor",
  HOME: process.env.HOME || homedir(),
  PWD: workspace.worktreePath,
}
```

## Gaps

Compared with VS Code, kitty, Ghostty, WezTerm, and other mature terminal flows, the current v2 path is missing:

- a small explicit public terminal identity surface such as `TERM_PROGRAM` and `TERM_PROGRAM_VERSION`
- a sanitized user-shell env layer
- a namespaced Superset metadata contract
- terminal-scoped attach or reattach semantics

## What To Preserve

User-needed env should still load by default. The practical set is:

- `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `PWD`
- locale vars like `LANG`, `LC_*`, `TZ`
- `SSH_AUTH_SOCK`
- proxy vars
- version-manager and runtime vars users depend on
- TLS and cert config

This should come from the user's shell environment, then be sanitized with an allowlist before spawning the terminal.

## What Not To Carry Over

These should not be part of the v2 shell contract unless there is a specific v2 consumer:

- `SUPERSET_PANE_ID`
- `SUPERSET_TAB_ID`
- `SUPERSET_PORT`
- other localhost-hook-specific metadata from the old desktop runtime

## Recommendation

V2 should move toward:

### Public env

```sh
TERM=xterm-256color
TERM_PROGRAM=Superset
TERM_PROGRAM_VERSION=<app version>
COLORTERM=truecolor
PWD=<workspace cwd>
```

### V2 metadata

Only if and when v2 actually uses them:

```sh
SUPERSET_WORKSPACE_ID=<workspace id>
SUPERSET_WORKSPACE_PATH=<workspace path>
SUPERSET_ROOT_PATH=<root path>
SUPERSET_TERMINAL_ID=<terminal id>
```

## Bottom Line

The current checked-out v2 terminal is still a thin prototype:

- workspace-scoped transport
- raw `process.env` passthrough
- no explicit terminal identity contract

The next step is to define a small env contract and stop relying on implicit `process.env` inheritance.
