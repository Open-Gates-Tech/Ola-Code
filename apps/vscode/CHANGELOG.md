# Changelog

## 0.1.1 (Preview)

- Isolate Ola Code's commands, sidebar, icons, context keys, walkthrough, review
  controller and diff URI schemes so Cline can remain installed alongside Ola.
- Store Ola settings and SDK sessions under `~/.ola-code` by default, without
  modifying or importing Cline's existing data. Shared history from 0.1.0 is left
  intact, but is not automatically shown in the new isolated store.
- Use Ctrl+Alt+' (Cmd+Option+' on macOS) for Ola's chat/context shortcut.

## 0.1.0 (Preview)

First public release of Ola Code.

- Sign in with your Opengates account; no API keys required.
- Agent, Plan, and Interactive modes.
- Sub-agents: Ola can delegate focused subtasks to helper agents that run in parallel.
- Fast and Thinking models.
- File edit and terminal command approvals, with a changes summary above the chat box.
- `@` mentions for files, folders, workspace problems, and URLs, plus active-file suggestions.
- Chat history with search, favorites, and workspace filters.
- MCP server support and Git worktrees.
