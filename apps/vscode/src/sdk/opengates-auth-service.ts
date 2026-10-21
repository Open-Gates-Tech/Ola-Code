import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import type { AuthState, UserInfo } from "@/shared/proto/cline/account"

export const OPENGATES_CALLBACK_PATH = "/auth/opengates"
export const OPENGATES_SESSION_KEY = "opengates.oauth.session"
const PENDING_KEY = "opengates.oauth.pending"
const AUTH_ORIGIN = "https://auth.opengates.app"
const CLIENT_ID = "ola-code-vscode"
const SCOPES = "openid profile email offline_access"

const sessionSchema = z.object({
	accessToken: z.string().min(1),
	refreshToken: z.string().min(1).optional(),
	expiresAt: z.number().positive().finite(),
})
const pendingSchema = z.object({
	state: z.string().min(1),
	verifier: z.string().min(1),
	redirectUri: z.string().url(),
	expiresAt: z.number().positive().finite(),
})
const tokenSchema = z.object({
	access_token: z.string().min(1),
	token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
	expires_in: z.number().positive().finite(),
	refresh_token: z.string().min(1).optional(),
})
const profileSchema = z.object({
	sub: z.string().min(1),
	name: z.string().optional(),
	email: z.string().optional(),
	picture: z.union([z.literal(""), z.string().url()]).optional(),
})

type Session = z.infer<typeof sessionSchema>

interface AuthDependencies {
	secrets: {
		get(key: string): PromiseLike<string | undefined>
		store(key: string, value: string): PromiseLike<void>
		delete(key: string): PromiseLike<void>
	}
	callbackUri: string
	getRedirectUri: () => Promise<string>
	openUrl: (url: string) => Promise<boolean>
	fetch: typeof globalThis.fetch
	reportError: (message: string) => void
}

class InvalidSessionError extends Error {}

export class OpengatesCallbackError extends Error {
	constructor(stage: string) {
		super(`Opengates sign-in failed during ${stage}. Start a fresh sign-in in the same VS Code window.`)
		this.name = "OpengatesCallbackError"
	}
}

export class OpengatesAuthService {
	private static instance: OpengatesAuthService | undefined
	private session: Session | undefined
	private user: UserInfo | undefined
	private revision = 0
	private refreshPromise: Promise<string> | undefined
	private callbackInProgress = false
	private callbackStage = "callback validation"
	private mutations: Promise<void> = Promise.resolve()
	private listeners = new Set<(state: AuthState) => Promise<void>>()
	private readonly ready: Promise<void>

	static initialize(dependencies: AuthDependencies): OpengatesAuthService {
		if (OpengatesAuthService.instance) throw new Error("Opengates authentication is already initialized")
		OpengatesAuthService.instance = new OpengatesAuthService(dependencies)
		return OpengatesAuthService.instance
	}

	static get(): OpengatesAuthService | undefined {
		return OpengatesAuthService.instance
	}

	constructor(private readonly dependencies: AuthDependencies) {
		this.ready = this.restore().catch(async (error) => {
			if (error instanceof InvalidSessionError) await this.logout()
			dependencies.reportError("Could not restore your Opengates session. Check your connection and sign in again.")
		})
	}

	private mutate(operation: () => Promise<void>): Promise<void> {
		const result = this.mutations.then(operation)
		// Keep the queue usable after failures; the caller still receives the original rejection.
		this.mutations = result.catch(() => {})
		return result
	}

	private async persistSession(session: Session, revision: number): Promise<void> {
		await this.mutate(async () => {
			if (revision !== this.revision) throw new Error("Opengates session changed.")
			await this.dependencies.secrets.store(OPENGATES_SESSION_KEY, JSON.stringify(session))
			if (revision !== this.revision) throw new Error("Opengates session changed.")
			this.session = session
		})
	}

	private async restore(): Promise<void> {
		const revision = this.revision
		const stored = await this.dependencies.secrets.get(OPENGATES_SESSION_KEY)
		if (!stored || revision !== this.revision) return
		this.session = sessionSchema.parse(JSON.parse(stored))
		const token = await this.getAccessToken()
		const user = await this.fetchUser(token)
		if (revision === this.revision) this.user = user
	}

	async getUser(): Promise<UserInfo | undefined> {
		await this.ready
		return this.user
	}

	async subscribe(listener: (state: AuthState) => Promise<void>): Promise<() => void> {
		this.listeners.add(listener)
		await this.ready
		await listener({ user: this.user })
		return () => this.listeners.delete(listener)
	}

	private async publish(): Promise<void> {
		await Promise.all(Array.from(this.listeners, (listener) => listener({ user: this.user })))
	}

	async login(): Promise<string> {
		await this.ready
		const revision = ++this.revision
		const verifier = randomBytes(32).toString("base64url")
		const state = randomBytes(32).toString("base64url")
		const externalUri = await this.dependencies.getRedirectUri()
		// Desktop externalization may append window routing data; OAuth requires the registered URI.
		const redirectUri = new URL(externalUri).protocol === "vscode:" ? this.dependencies.callbackUri : externalUri
		await this.mutate(async () => {
			if (revision !== this.revision) throw new Error("Opengates sign-in was cancelled.")
			await this.dependencies.secrets.store(
				PENDING_KEY,
				JSON.stringify({ state, verifier, redirectUri, expiresAt: Date.now() + 10 * 60_000 }),
			)
		})
		if (revision !== this.revision) throw new Error("Opengates sign-in was cancelled.")
		const url = new URL("/oauth/authorize", AUTH_ORIGIN)
		url.search = new URLSearchParams({
			response_type: "code",
			client_id: CLIENT_ID,
			redirect_uri: redirectUri,
			scope: SCOPES,
			state,
			code_challenge: createHash("sha256").update(verifier).digest("base64url"),
			code_challenge_method: "S256",
		}).toString()
		if (!(await this.dependencies.openUrl(url.toString()))) {
			await this.mutate(async () => {
				if (revision === this.revision) await this.dependencies.secrets.delete(PENDING_KEY)
			})
			throw new Error("Could not open the browser for Opengates sign-in.")
		}
		return "Complete sign-in with Opengates in your browser."
	}

	async handleCallback(url: URL): Promise<void> {
		if (this.callbackInProgress) throw new Error("Opengates sign-in is already being processed.")
		this.callbackInProgress = true
		this.callbackStage = "callback validation"
		try {
			await this.completeCallback(url)
		} catch {
			this.dependencies.reportError(`Opengates callback failed during ${this.callbackStage}.`)
			throw new OpengatesCallbackError(this.callbackStage)
		} finally {
			this.callbackInProgress = false
		}
	}

	private async completeCallback(url: URL): Promise<void> {
		await this.ready
		const startRevision = this.revision
		const expected = new URL(this.dependencies.callbackUri)
		if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname) {
			throw new Error("Unexpected Opengates callback URI.")
		}
		const raw = await this.dependencies.secrets.get(PENDING_KEY)
		if (!raw) throw new Error("No pending Opengates sign-in. Start sign-in again.")
		const pending = pendingSchema.parse(JSON.parse(raw))
		const state = url.searchParams.get("state") ?? ""
		const receivedState = Buffer.from(state)
		const expectedState = Buffer.from(pending.state)
		if (
			url.searchParams.getAll("state").length !== 1 ||
			receivedState.length !== expectedState.length ||
			!timingSafeEqual(receivedState, expectedState)
		) {
			throw new Error("Opengates sign-in state did not match. Start sign-in again.")
		}
		if (startRevision !== this.revision) throw new Error("Opengates sign-in was cancelled.")
		const revision = ++this.revision
		await this.mutate(async () => {
			if (revision !== this.revision) throw new Error("Opengates sign-in was cancelled.")
			await this.dependencies.secrets.delete(PENDING_KEY)
		})
		if (Date.now() >= pending.expiresAt) throw new Error("Opengates sign-in expired. Start sign-in again.")
		if (url.searchParams.has("error")) throw new Error("Opengates sign-in was declined. Start sign-in again.")
		const code = url.searchParams.get("code")
		if (!code || url.searchParams.getAll("code").length !== 1) throw new Error("Missing Opengates authorization code.")
		this.callbackStage = "token exchange"
		const session = await this.exchange({
			grant_type: "authorization_code",
			code,
			redirect_uri: pending.redirectUri,
			code_verifier: pending.verifier,
		})
		this.callbackStage = "profile loading"
		const user = await this.fetchUser(session.accessToken)
		if (revision !== this.revision) throw new Error("Opengates sign-in was cancelled.")
		this.callbackStage = "session storage"
		await this.persistSession(session, revision)
		this.user = user
		this.callbackStage = "account synchronization"
		await this.publish()
	}

	private async exchange(parameters: Record<string, string>, previousRefreshToken?: string): Promise<Session> {
		const response = await this.dependencies.fetch(`${AUTH_ORIGIN}/oauth/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
			body: new URLSearchParams({ ...parameters, client_id: CLIENT_ID }),
			signal: AbortSignal.timeout(30_000),
			redirect: "error",
		})
		if (!response.ok) {
			const body: unknown = await response.json()
			const invalidGrant = z.object({ error: z.literal("invalid_grant") }).safeParse(body).success
			if (response.status === 401 || (response.status === 400 && invalidGrant)) {
				throw new InvalidSessionError("Opengates credentials were rejected. Sign in again.")
			}
			throw new Error(`Opengates token request failed (HTTP ${response.status}).`)
		}
		const token = tokenSchema.parse(await response.json())
		return {
			accessToken: token.access_token,
			refreshToken: token.refresh_token ?? previousRefreshToken,
			expiresAt: Date.now() + token.expires_in * 1000,
		}
	}

	private async fetchUser(token: string): Promise<UserInfo> {
		const response = await this.dependencies.fetch(`${AUTH_ORIGIN}/oauth/userinfo`, {
			headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
			signal: AbortSignal.timeout(30_000),
			redirect: "error",
		})
		if (!response.ok) {
			if (response.status === 401) throw new InvalidSessionError("Opengates session expired. Sign in again.")
			throw new Error(`Opengates profile request failed (HTTP ${response.status}).`)
		}
		const profile = profileSchema.parse(await response.json())
		return { uid: profile.sub, displayName: profile.name, email: profile.email, photoUrl: profile.picture || undefined }
	}

	async getAccessToken(forceRefresh = false): Promise<string> {
		const session = this.session
		if (!session) throw new Error("Sign in with Opengates before using chat.")
		if (!forceRefresh && Date.now() + 60_000 < session.expiresAt) return session.accessToken
		if (this.refreshPromise) return this.refreshPromise
		const refresh = this.refresh(session)
		this.refreshPromise = refresh
		try {
			return await refresh
		} finally {
			if (this.refreshPromise === refresh) this.refreshPromise = undefined
		}
	}

	private async refresh(previous: Session): Promise<string> {
		const revision = this.revision
		try {
			if (!previous.refreshToken) throw new InvalidSessionError("Opengates session expired. Sign in again.")
			const session = await this.exchange(
				{ grant_type: "refresh_token", refresh_token: previous.refreshToken },
				previous.refreshToken,
			)
			if (revision !== this.revision) throw new Error("Opengates session changed during refresh.")
			await this.persistSession(session, revision)
			return session.accessToken
		} catch (error) {
			if (error instanceof InvalidSessionError && revision === this.revision) await this.logout()
			throw error
		}
	}

	async requireAuthentication(): Promise<void> {
		await this.ready
		await this.getAccessToken()
		if (!this.user) throw new Error("Could not load your Opengates profile. Sign in again.")
	}

	async synchronize(): Promise<void> {
		await this.ready
		await this.mutations
		const stored = await this.dependencies.secrets.get(OPENGATES_SESSION_KEY)
		if (stored === (this.session ? JSON.stringify(this.session) : undefined)) return
		const revision = ++this.revision
		this.session = undefined
		this.user = undefined
		this.refreshPromise = undefined
		if (stored) {
			try {
				this.session = sessionSchema.parse(JSON.parse(stored))
				const user = await this.fetchUser(await this.getAccessToken())
				if (revision !== this.revision) return
				this.user = user
			} catch (error) {
				if (revision !== this.revision) return
				if (error instanceof InvalidSessionError) {
					await this.logout()
					return
				}
				this.dependencies.reportError(
					"Could not synchronize your Opengates session. Check your connection and sign in again.",
				)
			}
		}
		if (revision === this.revision) await this.publish()
	}

	async logout(): Promise<void> {
		this.revision++
		this.session = undefined
		this.user = undefined
		this.refreshPromise = undefined
		await this.mutate(async () => {
			await this.dependencies.secrets.delete(PENDING_KEY)
			await this.dependencies.secrets.delete(OPENGATES_SESSION_KEY)
		})
		await this.publish()
	}
}
