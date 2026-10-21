
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

> **Public Preview:** Welcome to the initial release of Ola Code. Share feedback, report issues, or request features at [support.opengates.app](https://support.opengates.app).

<!-- Replace with absolute HTTPS URL before running vsce package, e.g., https://raw.githubusercontent.com/Open-Gates-Tech/ola-code/main/assets/demo.gif -->
<!-- ![Ola Code Workflow Demo](https://raw.githubusercontent.com/Open-Gates-Tech/ola-code/main/assets/demo.gif) -->

---

## Quick Start

1. **Install:** Install **Ola Code** from the VS Code Marketplace and click the **Ola** icon in the Activity Bar.
2. **Authenticate:** Click **Sign In with Opengates** to complete OAuth sign-in in your browser. *(New to Opengates? [Create a free account](https://www.opengates.app/signup)).*
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

### Dual-Tier Intelligence: Fast vs. Thinking
Toggle effortlessly between compute profiles directly from the model picker (your selection persists per workspace):
* **Fast (`ola-code-fast`):** Optimized for sub-second latency, inline edits, boilerplate generation, syntax fixes, and rapid Q&A.
* **Thinking (`ola-code-reason`):** Powered by deep-reasoning models for complex system architecture, tricky race conditions, and multi-file refactoring.

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

## Plans & Fair-Share Quotas

Ola Code is built on Opengates' mission to democratize access to world-class software engineering tools—offering transparent token pools and localized payment options (including Mobile Money / M-Pesa and cards via Paystack) without restrictive hourly lockouts.

| Tier | Monthly Fast Tokens | Monthly Thinking Tokens | Web Searches | Ideal For |
| :--- | :--- | :--- | :--- | :--- |
| **Free Community** | 500,000 | 250,000 | 5 / day | Students, learners, and open-source exploration |
| **Builder / Pro** | 10,000,000 | 1,500,000 | 20 / day | Professional freelancers, full-stack developers, and startup builders |
| **Ultra** | 30,000,000 | 5,000,000 | 50 / day | Heavy agentic workflows, engineering teams, and high-velocity shipping |

---

## Privacy, Security & Data Governance

* **OAuth 2.0 + PKCE Authentication:** Credentials are exchanged via RFC 7636 PKCE and stored exclusively inside VS Code's OS-level encrypted keychain (`SecretStorage`). Access tokens are never written to workspace files or exposed in logs.
* **Scoped Context Transmission:** Ola only transmits the explicit prompts, file excerpts, and diagnostics required to fulfill your active request over TLS.
* **Local-First Session Storage:** Conversation history and workspace checkpoints reside locally on your machine.
* **Sensitive File Guardrails:** Dotfiles and secret artifacts (`.env*`, `*.pem`, `*.key`, credentials) are excluded from automatic context suggestions by default.

---

## System Requirements

* **Editor:** Visual Studio Code `v1.101.0` or newer (or compatible VSCodium / Insiders builds).
* **Account:** An active [Opengates account](https://www.opengates.app/signup).

---

## Support & Community

* **Help Center & Bug Reports:** [support.opengates.app](https://support.opengates.app)
* **Platform & Account Management:** [www.opengates.app](https://www.opengates.app)

---

## License

Copyright © 2026 Opengates Link Limited (a Theta company).  
Released under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). Built upon the open-source [Cline](https://github.com/cline/cline) foundation.
