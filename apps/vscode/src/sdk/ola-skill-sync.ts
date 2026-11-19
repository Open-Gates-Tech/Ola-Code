import * as path from "node:path"
import type * as vscode from "vscode"
import { HostProvider } from "@/hosts/host-provider"
import { ShowMessageType } from "@/shared/proto/host/window"
import { Logger } from "@/shared/services/Logger"
import { resolveProductHomeDir } from "@/shared/storage/product-paths"
import {
	applyOlaSkillLibrary,
	clearOlaSkillLibrary,
	fetchOlaSkillLibrary,
	OlaSkillLibraryError,
	type OlaSkillPaths,
	type OlaSkillSyncResult,
} from "./ola-skill-library"
import type { OlaWorkspaceChoice } from "./ola-workspace"
import type { OpengatesAuthService } from "./opengates-auth-service"
import { createOpengatesFetch, OPENGATES_API_BASE_URL } from "./opengates-provider"

const EVERY = 15 * 60_000

function notify(type: ShowMessageType, message: string): void {
	void HostProvider.window.showMessage({ type, message }).catch(() => undefined)
}

export function olaSkillPaths(): OlaSkillPaths {
	const home = resolveProductHomeDir()
	return { skillsDir: path.join(home, "skills"), dataDir: path.join(home, "data") }
}

/**
 * Keeps Ola Code's copy of Ola's skill library current for the signed-in Opengates user and the workspace
 * Ola Code works in: on sign-in, every 15 minutes, and when the workspace changes. Sign-out removes it and
 * returns Ola Code to the personal workspace.
 */
export class OlaSkillSync implements vscode.Disposable {
	private readonly fetcher: typeof globalThis.fetch
	private running: Promise<OlaSkillSyncResult | undefined> = Promise.resolve(undefined)
	private timer: ReturnType<typeof setInterval> | undefined
	private unsubscribe: (() => void) | undefined
	private stopWatching: (() => void) | undefined
	private signedIn = false

	constructor(
		private readonly auth: OpengatesAuthService,
		private readonly choice: OlaWorkspaceChoice,
		private readonly paths: OlaSkillPaths = olaSkillPaths(),
		fetcher?: typeof globalThis.fetch,
	) {
		this.fetcher = fetcher ?? createOpengatesFetch(auth)
	}

	async start(): Promise<void> {
		this.stopWatching = this.choice.onChange(() => {
			if (this.signedIn) void this.sync().catch(() => undefined)
		})
		this.unsubscribe = await this.auth.subscribe(async ({ user }) => {
			const was = this.signedIn
			this.signedIn = Boolean(user)
			if (this.signedIn) {
				void this.sync().catch(() => undefined)
			} else if (was) {
				await this.choice.set(undefined)
				await this.queue(async () => {
					const removed = await clearOlaSkillLibrary(this.paths)
					if (removed.length) Logger.info(`[OlaSkills] Signed out; removed ${removed.length} library skills.`)
					return undefined
				})
			}
		})
		this.timer = setInterval(() => {
			if (this.signedIn) void this.sync().catch(() => undefined)
		}, EVERY)
	}

	/** The name of the workspace whose skills Ola Code uses. */
	workspaceName(): string {
		return this.choice.current()?.name ?? "Personal"
	}

	private queue(work: () => Promise<OlaSkillSyncResult | undefined>): Promise<OlaSkillSyncResult | undefined> {
		const next = this.running.catch(() => undefined).then(work)
		this.running = next.catch(() => undefined)
		return next
	}

	/** Brings the skills folder in line with the chosen workspace's library. Failures keep the last good copy. */
	sync(): Promise<OlaSkillSyncResult | undefined> {
		return this.queue(async () => {
			if (!(await this.auth.getUser())) return undefined
			const chosen = this.choice.current()
			try {
				const library = await fetchOlaSkillLibrary(this.fetcher, OPENGATES_API_BASE_URL, chosen?.id ?? "")
				const result = await applyOlaSkillLibrary(this.paths, library)
				Logger.info(
					`[OlaSkills] ${chosen?.name ?? "Personal"}: ${result.installed.length} skills, ${result.removed.length} removed, ${result.skipped.length} kept as your own.`,
				)
				return result
			} catch (error) {
				if (error instanceof OlaSkillLibraryError && error.code === "workspace_forbidden" && chosen) {
					// No longer a member: back to the personal workspace, for chats as well as skills.
					await this.choice.set(undefined)
					notify(
						ShowMessageType.WARNING,
						`You're no longer a member of ${chosen.name}, so Ola Code switched to your personal workspace.`,
					)
					const library = await fetchOlaSkillLibrary(this.fetcher, OPENGATES_API_BASE_URL, "")
					return applyOlaSkillLibrary(this.paths, library)
				}
				Logger.warn("[OlaSkills] Could not update Ola's skills; keeping the last copy.", error)
				throw error
			}
		})
	}

	dispose(): void {
		if (this.timer) clearInterval(this.timer)
		this.unsubscribe?.()
		this.stopWatching?.()
	}
}
