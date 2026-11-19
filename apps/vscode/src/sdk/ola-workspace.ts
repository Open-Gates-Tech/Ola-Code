import { z } from "zod"

/**
 * Which Ola workspace Ola Code works in: the person's own, or an organisation they belong to on Opengates.
 *
 * In an organisation's workspace, Ola uses that organisation's skills, memory and connected apps for chats,
 * and the organisation may pay for the member's Sparks (Biashara). Billing, the account and checkout stay
 * personal everywhere, so only chat requests and organisation calls carry the workspace.
 */

export const OLA_WORKSPACE_HEADER = "X-Ola-Workspace"
/** Saved in VS Code's global state, so the choice holds across windows and restarts. */
export const OLA_WORKSPACE_KEY = "ola.workspace"
/** Where the skill sync kept its choice before the choice covered all of Ola Code. */
export const LEGACY_WORKSPACE_KEY = "ola.skillsWorkspace"

const ID = /^[0-9a-f]{24}$/
const SLUG = /^[a-z0-9][a-z0-9_-]{0,62}$/

export const workspaceSchema = z.object({
	id: z.string().regex(ID),
	name: z.string().min(1).max(120),
	/** The workspace's URL name on the web (ola.opengates.app/s/<slug>). */
	slug: z.string().regex(SLUG).optional(),
	role: z.enum(["owner", "member"]).optional(),
})
export type OlaWorkspace = z.infer<typeof workspaceSchema>

/** GET /v1/workspaces: the organisations the person can open. Malformed entries are dropped, not trusted. */
export function parseWorkspaces(value: unknown): OlaWorkspace[] {
	const items = (value as { items?: unknown } | null)?.items
	if (!Array.isArray(items)) throw new Error("Ola sent a workspace list Ola Code couldn't read.")
	const out: OlaWorkspace[] = []
	for (const item of items.slice(0, 50)) {
		const parsed = workspaceSchema.safeParse(item)
		if (parsed.success && !out.some((w) => w.id === parsed.data.id)) out.push(parsed.data)
	}
	return out
}

interface Memento {
	get(key: string): unknown
	update(key: string, value: unknown): Thenable<void> | Promise<void>
}

type Listener = (workspace: OlaWorkspace | undefined) => void

/** The chosen workspace, shared by chats, the skill sync and the account view. Undefined is personal. */
export class OlaWorkspaceChoice {
	private static instance: OlaWorkspaceChoice | undefined
	private readonly listeners = new Set<Listener>()

	constructor(private readonly state: Memento) {}

	static initialize(state: Memento): OlaWorkspaceChoice {
		OlaWorkspaceChoice.instance = new OlaWorkspaceChoice(state)
		return OlaWorkspaceChoice.instance
	}

	/** The choice for this window, or undefined before activation (tests, the CLI): then everything is personal. */
	static get(): OlaWorkspaceChoice | undefined {
		return OlaWorkspaceChoice.instance
	}

	current(): OlaWorkspace | undefined {
		for (const key of [OLA_WORKSPACE_KEY, LEGACY_WORKSPACE_KEY]) {
			const parsed = workspaceSchema.safeParse(this.state.get(key))
			if (parsed.success) return parsed.data
		}
		return undefined
	}

	async set(workspace: OlaWorkspace | undefined): Promise<void> {
		await this.state.update(OLA_WORKSPACE_KEY, workspace)
		await this.state.update(LEGACY_WORKSPACE_KEY, undefined)
		for (const listener of this.listeners) listener(workspace)
	}

	onChange(listener: Listener): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}
}
