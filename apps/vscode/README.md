# Ola Code for VS Code

## Bounded live agent evaluation

After `bun run build:sdk` at the monorepo root, run from this package:

```powershell
bun scripts\ola-live-eval.ts C:\path\to\OlaAI-Server\infra\production.routing.json C:\private\ola-evaluation
```

The configured `AZURE_OPENAI_API_KEY` must already be in the process environment.
Do not put it in command arguments or output files. The runner only permits the
price-checked Azure Global GPT-4.1-mini route; it does not activate other model
prices or production billing. Docker and `node:22-alpine` are required.

The 30 small tasks cover five independent bugfix, feature and public-reference
research/scaffolding runs per Free/Pro label. Generated code executes only in
networkless, read-only, resource-limited containers with no host credentials.
Only project files can be edited; verification tests are immutable to the agent.
These are bounded sanity fixtures, not a full working-day or multi-file quality
benchmark. No hidden classifier or reviewer is configured in this harness.

`exposure.json` persists a USD10 total experiment cap. Every upstream attempt,
including SDK retries, needs a conservative reservation. Unknown usage retains
its reservation. Do not delete/reset this journal to continue a failed run.
The exclusive `experiment.lock` prevents concurrent writers; an abandoned lock
requires checking the owning process before manually removing that named file.

`runs.json` preserves failed runs and exact measured usage; `summary.json` records
completion, cost, observed cache reads and single-wallet Sparks grant values.
The separately labeled `cache-probe.json` observes a controlled long prefix in
two agent turns, within the same USD10 cap. It is not a workflow cache guarantee.
Evaluation SSE is buffered for evidence persistence, so this is not a production
streaming latency test. Feed `runs.json` to the server's
`cmd/ola-agent-eval -sparks -evidence ...` checker.

These artifacts contain only synthetic project content and usage, but still
belong in a private evaluation directory, not the source repository.

## Opengates account integration

The VS Code extension requires an Opengates account and routes inference through
the OpenAI-compatible gateway at `https://ola-pilot-api.proudglacier-876118b2.eastus2.azurecontainerapps.io/v1`, using
`ola-code-fast` (Fast) or `ola-code-reason` (Thinking) for both Plan and Agent modes. Other hosts retain their existing
authentication and provider behavior.

The Ola sidebar is a conversation above a bottom composer. It keeps attachments,
tool approvals, Plan/Agent switching, a model picker, MCP servers, and Worktrees.
The context hint appears only for empty drafts. Once typing begins, the input
shrinks to fit a short draft and grows with longer messages, up to ten lines.
The title toolbar includes Chat History beside New Task. History supports search,
workspace filtering, favorites, and reopening previous conversations. Opening
history preserves the current chat draft. Local history is not synced through
the Opengates account.
Ola history uses rounded conversation cards, visible favorites and workspace
filters, keyboard-accessible actions, and collapsible details. Bulk deletion
and storage cleanup remain available in the footer.
Chat, history, and account content is centered with a maximum width of 900px,
remaining fluid in narrow sidebars. Conversation and history lists have their own
theme-aware scrollbars; the chat composer stays outside the scrolling region.
New conversations show the Ola PNG logo in its original colours above the personalized greeting.
The logo is bundled as an inline data URL so it loads in VS Code webviews without
depending on a document-relative asset path.
The introduction text is 30% wider than its original 16rem limit. Assistant text,
completed responses, and plans use rounded cards with more comfortable spacing;
copy, quote, and view-changes actions remain available.
Settings, provider configuration, promotional banners, and
detailed task-header statistics are not shown in Ola. Account configuration is
managed on the web; the VS Code account action remains available for sign-out.
Plan retains the existing planning behavior; it is not a read-only Ask mode.
The mode switch offers Interactive, Plan, and Agent. Interactive is Agent mode
with extra instructions: Ola first asks clarifying questions, then summarizes
its approach and waits for confirmation before changing files or running
commands. The choice persists, and switching between Interactive and Agent
rebuilds the active session so the instructions take effect immediately. The
keyboard shortcut cycles through all three modes.
The composer suggests the active editor file as a clickable chip, including the
selected line range when present. The chip shows a file-type icon based on the
file name or extension. VS Code's active file-icon theme is unavailable to
webviews, so Ola bundles its own icon set. Clicking inserts a file mention or a snapshot
of the selected lines into the draft; it does not send a message. File switches
and selection changes update the suggestion. `.env` files, common credential
files, and private-key files are excluded from suggestions. This filename filter
is a convenience safeguard, not a secret scanner: review attachments before sending.
Pro is displayed as unavailable until a gateway model is supplied. Changing the
model persists the selection for both modes and applies through the SDK provider
configuration, including auxiliary requests.

The account usage view keeps the current **Fast** and **Thinking & Pro** raw-token
labels. It reads `allowance_policy_version`, `fast_limit`, and `reason_limit`
from `GET /v1/account`; limits are authoritative integers (`-1` means unlimited,
`0` means no allowance). Older servers may omit these additive fields: the view
then shows reported remaining tokens with an unavailable total, without guessing
from the plan tier or showing a percentage. These balances are separate from the
Standard/Premium evaluation budgets.

For an authenticated OpenGates task, the extension reads `GET /v1/usage` before
generation. Only when the response explicitly reports
`agent_budget_policy.mode = shadow` does it offer visible bugfix, feature, and
research presets and create `/v1/agent-tasks` metadata. The user may separately
grant or decline Premium evaluation consent for that task; consent does not
change the selected model or enable an active grant. Generation requests then
carry `X-Ola-Agent-Task-Id` for correlation. The account view can refresh the
latest task snapshot from `GET /v1/agent-tasks/:id`, clearly labeled evaluation
only and non-enforcing. Server-reported Standard/Premium remaining and held
balances are shown when the task response provides them; otherwise the UI says
they are unavailable. A missing/off policy leaves task creation and consent
endpoints untouched. None of these evaluation values retires or replaces the
existing raw-token allowances.

OAuth uses a public client, authorization code flow, and PKCE (S256):

| Setting | Value |
| --- | --- |
| Client ID | `ola-code-vscode` |
| Authorization endpoint | `https://auth.opengates.app/oauth/authorize` |
| Token and refresh endpoint | `https://auth.opengates.app/oauth/token` |
| OIDC userinfo endpoint | `https://auth.opengates.app/oauth/userinfo` |
| Scopes | `openid profile email offline_access` |
| Desktop redirect URI | `vscode://opengates.ola-code/auth/opengates` |

Register the client and exact callback with the authentication server before
testing. No client secret belongs in the extension. VS Code Insiders and remote
or browser-hosted environments can produce different callback URIs through
`vscode.env.asExternalUri`; those environments need explicitly registered,
validated callbacks on the server. Do not enable arbitrary redirect URLs.

The token endpoint must return `access_token`, `token_type: "Bearer"`, a positive
numeric `expires_in` (seconds), and optionally `refresh_token`. Refresh uses
`grant_type=refresh_token`; rotated refresh tokens replace the stored token.
The userinfo endpoint must return an OIDC `sub` and may include `name`, `email`,
and `picture`. The gateway must accept the access token's audience and scopes.

Tokens and pending PKCE state are stored in VS Code SecretStorage. Tokens are not
sent to the webview or written to SDK provider/session configuration. The callback
contains only `code` and `state`, never an access token. Pending login expires
after ten minutes.

Gateway requests resolve credentials at request time. A 401 triggers one refresh
and one retry; rejection of the refreshed token signs the user out. Transient
network/server errors preserve credentials. Signing out clears local credentials
and cancels the active task; server-side session/token revocation is not configured
because no revocation endpoint has been supplied.

### Validation

The **Run Extension (production)** F5 configuration uses a separate VS Code user
profile and extensions directory under `dist/dev-profile` and `dist/dev-extensions`,
with Settings Sync disabled. This keeps installed extensions and normal profile
settings from interfering with the development host. The profile persists between
launches; the separate SecretStorage may require signing in again.

Ola uses `ola-code.*` command/context IDs, `ola-code.SidebarProvider`, and
`ola-code-ActivityBar`. The manifest and runtime registry must always agree.
Never restore Cline's IDs or add aliases for them: they collide when both
extensions are installed. Diff URI schemes, review controllers, icons and
walkthrough IDs are also product-specific.

The default data home is `~/.ola-code`, including SDK sessions and file-backed
settings under `data`. Global rules, workflows, hooks, worktrees and MCP server source
directories use `Documents/Ola Code`. Existing files in `~/.cline` and
`Documents/Cline` are left untouched and are not automatically imported, since
they may belong to Cline. Upgrading from 0.1.0 therefore starts a separate history
and settings store; Opengates sign-in stays in Ola's extension-scoped SecretStorage.
Explicit `CLINE_DIR`, `CLINE_DATA_DIR` and SDK path overrides remain supported for
development; don't point Ola and Cline at the same override directories.
SDK home selection is module-local, not a change to the shared extension-host
process environment.

Ola's chat/context shortcut is **Ctrl+Alt+'** (**Cmd+Option+'** on macOS) so it
doesn't shadow Cline's **Ctrl/Cmd+'** shortcut.

For F5 development, the root VS Code tasks generate protos before starting the
watchers. The webview build task runs the UI build directly after that prerequisite
instead of running `build:webview`, which would generate protos again while
TypeScript watch is resolving the generated host-bridge types. `bun run protos`
also regenerates `src/shared/proto` and `src/generated` in place and prunes stale
files only afterwards, so running watchers never see those modules disappear.

From this directory:

```powershell
bun run test:vitest src\sdk\opengates-auth-service.test.ts src\sdk\sdk-api-handler.test.ts src\sdk\cline-session-factory.test.ts
bun run check-types
```

If SDK distribution files are missing, first run `bun run build:sdk` from the
repository root.

For a live check, launch the extension development host, click **Sign In with
Opengates**, complete browser login, verify the account profile, send a message,
reload VS Code to check session restoration, then sign out. Test denied login,
expired login, rejected refresh, and gateway 401 responses as well. Live login
requires the deployed OAuth client configuration and a real test account.