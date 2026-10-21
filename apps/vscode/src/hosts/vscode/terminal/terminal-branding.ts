import * as vscode from "vscode"
import { ExtensionRegistryInfo } from "@/registry"
import { OpengatesAuthService } from "@/sdk/opengates-auth-service"

type TerminalBranding = Pick<vscode.TerminalOptions, "name" | "iconPath" | "isTransient">

export function getAssistantDisplayName(): string {
	return OpengatesAuthService.get() ? "Ola" : "Cline"
}

/** Name and icon for terminals the extension opens, branded as Ola when Opengates auth is active. */
export function getTerminalBranding(): TerminalBranding {
	if (!OpengatesAuthService.get()) {
		return { name: "Cline", iconPath: new vscode.ThemeIcon(ExtensionRegistryInfo.iconId) }
	}
	// Transient: restored terminals can't be tracked by the registry and would keep stale branding after reloads.
	const extensionUri = vscode.extensions.getExtension(ExtensionRegistryInfo.id)?.extensionUri
	if (!extensionUri) {
		return { name: "Ola Code", iconPath: new vscode.ThemeIcon("terminal"), isTransient: true }
	}
	return {
		name: "Ola Code",
		isTransient: true,
		iconPath: {
			light: vscode.Uri.joinPath(extensionUri, "assets", "icons", "ola-terminal-light.svg"),
			dark: vscode.Uri.joinPath(extensionUri, "assets", "icons", "ola-terminal-dark.svg"),
		},
	}
}
