# Changelog

## [0.1.6] (Preview)

- Zawadi in the Sparks view: your invite link with a copy button, WhatsApp
  sharing, how many friends have joined and been rewarded, and your own progress
  if you joined with a friend's link.
- Ola Code's Sparks messages now use its model names: Bure pays for Fast and
  Thinking, and Pro needs 150,000 Sparks to start.
- Refreshed the Marketplace page: KES bundles, top-ups and Bure instead of the
  retired USD plans, web searches charged in Sparks, the Fast, Thinking and Pro
  models, Zawadi and Biashara for teams.

## [0.1.5] (Preview)

- Buy Sparks bundles and top-ups in KES from the Sparks view, and see running
  bundles with the time they have left.
- See your Mwezi subscription and when it renews, with Cancel or Renew; Mwezi
  bundles can renew every month on a card. Pro, Ultra and Ultra Plus subscribers see
  when their plan becomes Mwezi, Mwezi Plus or Mwezi Max. The USD plans are gone.
- Free accounts get Bure: free Sparks every day, refilled at midnight East Africa
  Time, for Fast and Thinking.
- Clear messages when Sparks run out: Bure's daily limit, Pro's 150,000-Spark
  minimum, an empty balance, and an organisation's monthly limit or empty team
  Sparks, instead of a generic error or a long "try again in" countdown.

## [0.1.4] (Preview)

- Use Ola blue (#1976d2) for buttons, the Plan/Agent switch, the chat input box and
  its controls, and the thinking indicator, regardless of the editor theme.

## [0.1.3] (Preview)

- Keep coding through eligible model failures with internal, bounded recovery.
- Improve automatic conversation compaction and preserve recent tool state when
  resuming long sessions.
- Avoid duplicate generation retries and show clearer recovery guidance.
- Keep each task on one model so repeated context is served from the
  provider's cache, making Sparks last longer on long agent tasks.
- Simplify the Sparks account view by removing recent model-call and token
  diagnostics. Balance, held Sparks, reset dates and plans remain available.

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
