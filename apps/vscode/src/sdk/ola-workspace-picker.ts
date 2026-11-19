import * as vscode from "vscode"
import { HostProvider } from "@/hosts/host-provider"
import { ShowMessageType } from "@/shared/proto/host/window"
import { Logger } from "@/shared/services/Logger"
import { type OlaWorkspace, type OlaWorkspaceChoice, parseWorkspaces } from "./ola-workspace"
import type { OpengatesAuthService } from "./opengates-auth-service"
import { OPENGATES_API_BASE_URL } from "./opengates-provider"

function notify(type: ShowMessageType, message: string): void {
	void HostProvider.window.showMessage({ type, message }).catch(() => undefined)
}

/** The organisations the person belongs to, from Ola. */
export async function fetchOlaWorkspaces(fetcher: typeof globalThis.fetch): Promise<OlaWorkspace[]> {
	const response = await fetcher(`${OPENGATES_API_BASE_URL}/workspaces`, { signal: AbortSignal.timeout(15_000) })
	if (!response.ok) {
		await response.body?.cancel()
		throw new Error(`Ola's workspace list is unavailable (HTTP ${response.status}).`)
	}
	return parseWorkspaces(await response.json())
}

/**
 * Lets the person choose where Ola Code works: their own workspace or one of their organisations'. It returns
 * the new choice, or false when nothing changed.
 */
export async function chooseOlaWorkspace(
	auth: OpengatesAuthService,
	choice: OlaWorkspaceChoice,
	fetcher: typeof globalThis.fetch,
): Promise<OlaWorkspace | undefined | false> {
	if (!(await auth.getUser())) {
		notify(ShowMessageType.INFORMATION, "Sign in to Ola Code with Opengates first.")
		return false
	}
	let organisations: OlaWorkspace[]
	try {
		organisations = await fetchOlaWorkspaces(fetcher)
	} catch (error) {
		Logger.warn("[OlaWorkspace] Could not load workspaces.", error)
		notify(ShowMessageType.ERROR, "Your Ola workspaces couldn't be loaded. Try again shortly.")
		return false
	}
	const current = choice.current()
	const items = [
		{ label: "Personal", description: current ? "Your own skills and Sparks" : "Current", workspace: undefined },
		...organisations.map((workspace) => ({
			label: workspace.name,
			description: [
				workspace.id === current?.id ? "Current" : "",
				workspace.role === "owner" ? "Your organisation account" : "Organisation",
			]
				.filter(Boolean)
				.join(" · "),
			workspace,
		})),
	]
	if (organisations.length === 0 && !current) {
		notify(
			ShowMessageType.INFORMATION,
			"You aren't a member of any organisation on Opengates yet, so Ola Code works in your personal workspace.",
		)
		return false
	}
	const picked = await vscode.window.showQuickPick(items, {
		title: "Where should Ola Code work?",
		placeHolder: `Now: ${current?.name ?? "Personal"}. An organisation's workspace uses its skills, memory and apps, and it may pay for your Sparks.`,
	})
	if (!picked || picked.workspace?.id === current?.id) return false
	await choice.set(picked.workspace)
	notify(
		ShowMessageType.INFORMATION,
		picked.workspace
			? `Ola Code now works in ${picked.workspace.name}'s workspace. New messages use its skills and memory.`
			: "Ola Code now works in your personal workspace.",
	)
	return picked.workspace
}
