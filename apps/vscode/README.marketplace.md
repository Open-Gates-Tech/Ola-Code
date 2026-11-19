
# Ola Code

**Autonomous AI Software Engineering in VS Code — Built by [Opengates](https://opengates.app), a Theta company.**

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=opengates.ola-code">
    <img src="https://img.shields.io/visual-studio-marketplace/v/opengates.ola-code.svg?style=flat-square&label=VS%20Code%20Marketplace&color=0f172a" alt="VS Code Marketplace Version">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=opengates.ola-code">
    <img src="https://img.shields.io/visual-studio-marketplace/i/opengates.ola-code.svg?style=flat-square&color=1e3a8a" alt="Installs">
  </a>
  <a href="https://github.com/Open-Gates-Tech/ola-code/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-Apache_2.0-334155.svg?style=flat-square" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://www.opengates.app/signup"><strong>Create an Account</strong></a> &nbsp;·&nbsp;
  <a href="https://opengates.app"><strong>Opengates Platform</strong></a> &nbsp;·&nbsp;
  <a href="https://support.opengates.app"><strong>Documentation & Support</strong></a>
</p>

---

**Ola Code** is an autonomous AI software engineering agent that operates directly inside your VS Code workspace. Describe a feature, architectural refactor, or bug fix—Ola analyzes your repository, formulates an execution plan, edits multi-file codebases, and executes terminal workflows with human-in-the-loop approval at every step.

Zero API keys or complex cloud provider setups required. Sign in with your Opengates account and start shipping immediately.

> **Public Preview:** Ola Code is in public preview. Share feedback, report issues, or request features at [support.opengates.app](https://support.opengates.app).

<!-- Replace with absolute HTTPS URL before running vsce package, e.g., https://raw.githubusercontent.com/Open-Gates-Tech/ola-code/main/assets/demo.gif -->
<!-- ![Ola Code Workflow Demo](https://raw.githubusercontent.com/Open-Gates-Tech/ola-code/main/assets/demo.gif) -->

---

## Quick Start

1. **Install:** Install **Ola Code** from the VS Code Marketplace and click the **Ola** icon in the Activity Bar.
2. **Authenticate:** Click **Sign In with Opengates** to complete OAuth sign-in in your browser. *(New to Opengates? [Create a free account](https://www.opengates.app/signup).)* Free accounts get Bure, free Sparks every day.
3. **Build:** Enter a prompt in the chat panel—for example, *"Add Zod input validation to the authentication routes and write unit tests"*—and press **Enter**.

---

## Core Workflows

### Three Execution Modes
Switch modes dynamically in the chat input bar to match the complexity of your task:

| Mode | Best For | How Ola Operates |
| :--- | :--- | :--- |
| **Agent** | End-to-end feature builds, bug fixes, test generation | Autonomously explores the codebase, edits files, and runs commands with your approval. |
| **Plan** | Multi-file refactors, system architecture, complex migrations | Investigates your workspace and drafts a step-by-step technical spec before touching any code. |
| **Interactive** | Pair programming, unfamiliar codebases, guided debugging | Asks clarifying questions first, aligns on the approach, and waits for confirmation at each step. |

### Three Models: Fast, Thinking and Pro
Pick a model from the model picker (your selection persists per workspace):
* **Fast (`ola-code-fast`):** Low latency for inline edits, boilerplate, syntax fixes and quick questions.
* **Thinking (`ola-code-reason`):** Reasoning models for architecture, tricky bugs and multi-file refactoring.
* **Pro (`ola-code-pro`):** The most capable models for the hardest tasks. A Pro task needs at least 150,000 Sparks to start, so it is unlikely to run short part-way.

---

## Key Capabilities

### Human-in-the-Loop Control
* **Interactive Diff Review:** Every proposed file modification opens in a native VS Code diff view. Accept, modify, or reject changes line by line before saving to disk.
* **Change Summary & Checkpoints:** Review a live summary above the chat box (`N files changed` with `+additions` and `-deletions`). Need to roll back? Edit any earlier message to restore your workspace to that exact checkpoint.
* **Sandboxed Terminal Approval:** Commands execute after explicit confirmation, with configurable auto-approve rules for trusted read-only or test commands.

### Precision Context Injection
* **`@` Mentions:** Reference specific files, directories, compiler diagnostics (`@problems`), or live documentation URLs directly in your prompt.
* **Smart Active Context:** Ola automatically surfaces your currently active editor file and highlighted line ranges as one-click context chips.
* **Native Editor Actions:** Right-click any code selection to **Add to Ola**, or trigger the VS Code Quick Fix lightbulb (`Ctrl+.` / `Cmd+.`) to **Explain**, **Improve**, or **Fix with Ola**.

### Developer Ecosystem & Extensibility
* **Parallel Sub-Agents:** For larger tasks, Ola can delegate focused subtasks (e.g., researching separate modules) to helper sub-agents that run in parallel. Approve each delegation, track live progress in the chat, and let Ola merge the results.
* **Model Context Protocol (MCP):** Connect Ola to external databases, internal APIs, issue trackers, and custom tooling via standard MCP servers.
* **Parallel Git Worktrees:** Spin up isolated Git worktrees to run background agent tasks without dirtying your active working branch.
* **Automated Commit Messages:** Generate conventional commit messages directly from staged diffs in the VS Code Source Control panel.
* **Local Workspace History:** Search, bookmark, filter by project, and resume past engineering sessions seamlessly.

---

## Sparks: Bure, Bundles and Top-ups

Every model call and web search uses Sparks, from one wallet shared with Ola on the web. 1,000,000 Sparks is USD 1 of model cost, charged at each model's published rates for input, cached input and output; web searches are charged at cost. Holds are temporary reservations, not charges.

* **Bure (free):** Free accounts get 20,000 Sparks every day for Fast and Thinking, refilled at midnight East Africa Time. Unused Bure does not carry over, and on a very busy day free Sparks can pause until midnight.
* **Bundles:** Buy more in KES from the Sparks view in Ola Code, paid through Paystack. Whatever ends soonest is spent first, so Bure and bundles are not wasted.
* **Top-ups:** Sparks that never expire, spent last.

| Bundle | Price (KES, VAT incl.) | Sparks | Lasts |
| :--- | ---: | ---: | :--- |
| Saa Moja | 10 | 40,000 | One hour |
| Saa Tatu | 25 | 100,000 | Three hours |
| Usiku | 20 | 100,000 | 11 PM to 5 AM |
| Hadi Usiku | 40 | 170,000 | Until midnight (sold until 9 PM) |
| Siku | 50 | 230,000 | One day |
| Wiki | 250 | 1,200,000 | One week |
| Mwezi | 650 | 3,400,000 | 30 days |
| Mwezi Plus | 1,950 | 10,200,000 | 30 days |
| Mwezi Max | 3,900 | 20,400,000 | 30 days |
| Top-up 50 / 100 / 250 | 50 / 100 / 250 | 200,000 / 400,000 / 1,000,000 | Never expire |

Mwezi, Mwezi Plus and Mwezi Max can renew every month on a card; cancel any time from the Sparks view. Prices can change; the Sparks view and [ola.opengates.app/bundles](https://ola.opengates.app/bundles) always show the current ones.

**Zawadi:** invite a friend with your link from the Sparks view. When they join Ola and send five messages, you both get 100,000 Sparks for 7 days. [How Zawadi works](https://ola.opengates.app/zawadi).

**Teams:** with Biashara, an organisation buys Sparks once and its staff use them within a monthly limit each. [Ola for teams](https://ola.opengates.app/biashara).

The account panel shows your available Sparks, running bundles with their time left, held Sparks, your subscription and your Zawadi link, and refreshes while open.

---

## Privacy, Security & Data Governance

* **OAuth 2.0 + PKCE Authentication:** Credentials are exchanged via RFC 7636 PKCE and stored exclusively inside VS Code's OS-level encrypted keychain (`SecretStorage`). Access tokens are never written to workspace files or exposed in logs.
* **Scoped Context Transmission:** Ola only transmits the explicit prompts, file excerpts, and diagnostics required to fulfill your active request over TLS.
* **Local-First Session Storage:** Conversation history and workspace checkpoints reside locally on your machine.

---

## System Requirements

* **Editor:** Visual Studio Code `v1.101.0` or newer (or compatible VSCodium / Insiders builds).
* **Account:** An active [Opengates account](https://www.opengates.app/signup).

---

## Support & Community

* **Help Center & Bug Reports:** [support.opengates.app](https://support.opengates.app)
* **Platform & Account Management:** [www.opengates.app](https://www.opengates.app)
* **Ola on the web:** [ola.opengates.app](https://ola.opengates.app)

---

## License

Copyright © 2026 Opengates Link Limited (a Theta company).  
Released under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). Built upon the open-source [Cline](https://github.com/cline/cline) foundation.
