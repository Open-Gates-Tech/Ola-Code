import fs from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { contributes, name, publisher } from "../package.json"
import { ExtensionRegistryInfo } from "./registry"

vi.mock("./hosts/host-provider", () => ({ HostProvider: {} }))

describe("extension contribution registry", () => {
	it("registers the sidebar declared in the manifest", () => {
		const viewIds = Object.values(contributes.views).flatMap((views) => views.map((view) => view.id))
		expect(viewIds).toContain(ExtensionRegistryInfo.views.Sidebar)
	})

	it("registers the visible toolbar commands declared in the manifest", () => {
		const commandIds = contributes.commands.map((command) => command.command)
		const titleCommands = contributes.menus["view/title"].map((item) => item.command)
		for (const key of ["PlusButton", "HistoryButton", "McpButton", "WorktreesButton", "AccountButton"] as const) {
			expect(commandIds).toContain(ExtensionRegistryInfo.commands[key])
			expect(titleCommands).toContain(ExtensionRegistryInfo.commands[key])
		}
	})

	it("places chat history immediately after new task in the toolbar", () => {
		const titleCommands = contributes.menus["view/title"]
		expect(titleCommands.find((item) => item.command === ExtensionRegistryInfo.commands.PlusButton)?.group).toBe(
			"navigation@1",
		)
		expect(titleCommands.find((item) => item.command === ExtensionRegistryInfo.commands.HistoryButton)?.group).toBe(
			"navigation@2",
		)
	})

	it("preserves the branded extension identity", () => {
		expect(ExtensionRegistryInfo.name).toBe(name)
		expect(ExtensionRegistryInfo.id).toBe(`${publisher}.${name}`)
	})

	it("does not contribute Cline's globally shared identifiers", () => {
		const manifest = JSON.stringify(contributes)
		expect(manifest).not.toMatch(/claude-dev|cline\.|cline-icon|ClineWalkthrough/)
		for (const command of Object.values(ExtensionRegistryInfo.commands)) {
			expect(command).toMatch(/^ola-code\./)
		}
		expect(ExtensionRegistryInfo.views.Sidebar).toBe("ola-code.SidebarProvider")
		expect(contributes.viewsContainers.activitybar[0].id).toBe("ola-code-ActivityBar")
	})

	it("wires every menu and shortcut to an Ola command", () => {
		const commands = new Set(contributes.commands.map((command) => command.command))
		for (const menu of Object.values(contributes.menus)) {
			for (const item of menu) {
				expect(commands.has(item.command)).toBe(true)
			}
		}
		for (const shortcut of contributes.keybindings) {
			expect(commands.has(shortcut.command)).toBe(true)
			// Cline owns Ctrl/Cmd+'. Ola must not shadow that binding.
			if ("key" in shortcut) {
				expect(shortcut.key).toContain("alt+")
				expect(shortcut.mac).toContain("alt+")
			}
		}
		const runtimeCommands = Object.values(ExtensionRegistryInfo.commands)
		for (const command of commands) {
			expect(runtimeCommands).toContain(command)
		}
	})

	it("matches walkthroughs, icons and context keys to runtime identifiers", () => {
		expect(contributes.walkthroughs[0].id).toBe(ExtensionRegistryInfo.walkthroughId)
		expect(Object.keys(contributes.icons)).toContain(ExtensionRegistryInfo.iconId)
		const conditions = JSON.stringify(contributes)
		for (const contextKey of Object.values(ExtensionRegistryInfo.contextKeys)) {
			expect(conditions).toContain(contextKey)
		}
	})

	it("uses product-specific URI schemes and comment controller IDs", () => {
		expect(ExtensionRegistryInfo.diffScheme).toBe("ola-code-diff")
		expect(ExtensionRegistryInfo.editPreviewScheme).toBe("ola-code-edit-preview")
		expect(ExtensionRegistryInfo.reviewControllerId).toBe("ola-code-ai-review")
	})

	it("does not reintroduce hardcoded Cline registrations in the host", () => {
		const files = [
			"extension.ts",
			"hosts/vscode/commit-message-generator.ts",
			"hosts/vscode/VscodeDiffContentProvider.ts",
			"hosts/vscode/VscodeEditPreview.ts",
			"hosts/vscode/hostbridge/env/getIdeRedirectUri.ts",
			"core/controller/ui/openWalkthrough.ts",
			"dev/commands/tasks.ts",
		]
		for (const file of files) {
			const source = fs.readFileSync(new URL(file, import.meta.url), "utf8")
			expect(source).not.toMatch(
				/["'`]cline\.(?:is|dev|plus|add|focus)|["'`]cline-(?:diff|edit-preview)|saoudrizwan\.claude-dev/,
			)
		}
	})
})
