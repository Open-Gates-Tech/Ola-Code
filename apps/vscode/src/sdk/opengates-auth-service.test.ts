import { createHash } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveOpengatesModel } from "@/shared/opengates-models"
import { OPENGATES_SESSION_KEY, OpengatesAuthService } from "./opengates-auth-service"
import { createOpengatesFetch, getOpengatesProviderConfig, OPENGATES_API_BASE_URL } from "./opengates-provider"
import { createOpengatesTaskCorrelation } from "./opengates-task-budget"

vi.mock("@/shared/net", () => ({ fetch: vi.fn() }))

const CALLBACK = "vscode://opengates.ola-code/auth/opengates"
const profile = { sub: "test-user", name: "Test User", email: "user@example.test" }
const token = { access_token: "test-access", token_type: "Bearer", expires_in: 3600, refresh_token: "test-refresh" }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function setup(stored?: { accessToken: string; refreshToken?: string; expiresAt: number }) {
	const storage = new Map<string, string>()
	if (stored) storage.set(OPENGATES_SESSION_KEY, JSON.stringify(stored))
	const dependencies = {
		secrets: {
			get: vi.fn(async (key: string) => storage.get(key)),
			store: vi.fn(async (key: string, value: string) => {
				storage.set(key, value)
			}),
			delete: vi.fn(async (key: string) => {
				storage.delete(key)
			}),
		},
		callbackUri: CALLBACK,
		getRedirectUri: vi.fn(async () => CALLBACK),
		openUrl: vi.fn(async (_url: string) => true),
		fetch: vi.fn<typeof globalThis.fetch>(),
		reportError: vi.fn(),
	}
	const auth = new OpengatesAuthService(dependencies)
	const callback = async (code = "test-code") => {
		await auth.login()
		const authorizationUrl = new URL(dependencies.openUrl.mock.calls.at(-1)![0])
		const url = new URL(CALLBACK)
		url.search = new URLSearchParams({ code, state: authorizationUrl.searchParams.get("state")! }).toString()
		return url
	}
	return { auth, dependencies, storage, callback }
}

async function signedIn() {
	const fixture = setup()
	fixture.dependencies.fetch.mockResolvedValueOnce(json(token)).mockResolvedValueOnce(json(profile))
	await fixture.auth.handleCallback(await fixture.callback())
	return fixture
}

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("Opengates OAuth", () => {
	it("uses the exact desktop callback when VS Code appends encoded window routing data", async () => {
		const { auth, dependencies, storage } = setup()
		dependencies.getRedirectUri.mockResolvedValue(`${CALLBACK}%3FwindowId%3D9`)
		await auth.login()
		const url = new URL(dependencies.openUrl.mock.calls[0][0])
		expect(url.searchParams.get("redirect_uri")).toBe(CALLBACK)
		expect(JSON.parse(storage.get("opengates.oauth.pending")!).redirectUri).toBe(CALLBACK)
	})

	it("opens the registered public client with random state and S256 PKCE", async () => {
		const { auth, dependencies, storage } = setup()
		await auth.login()
		const url = new URL(dependencies.openUrl.mock.calls[0][0])
		const pending = JSON.parse(storage.get("opengates.oauth.pending")!)
		expect(url.origin + url.pathname).toBe("https://auth.opengates.app/oauth/authorize")
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			client_id: "ola-code-vscode",
			response_type: "code",
			scope: "openid profile email offline_access",
			redirect_uri: CALLBACK,
			code_challenge_method: "S256",
			state: pending.state,
			code_challenge: createHash("sha256").update(pending.verifier).digest("base64url"),
		})
		expect(url.searchParams.has("client_secret")).toBe(false)
		await auth.login()
		expect(new URL(dependencies.openUrl.mock.calls[1][0]).searchParams.get("state")).not.toBe(pending.state)
	})

	it("exchanges a code and stores tokens only in SecretStorage, publishing a safe profile", async () => {
		const { auth, dependencies, storage, callback } = setup()
		const listener = vi.fn(async () => {})
		await auth.subscribe(listener)
		dependencies.fetch.mockResolvedValueOnce(json(token)).mockResolvedValueOnce(json(profile))
		await auth.handleCallback(await callback("code+with&reserved"))
		const [endpoint, request] = dependencies.fetch.mock.calls[0]
		expect(endpoint).toBe("https://auth.opengates.app/oauth/token")
		expect(request?.method).toBe("POST")
		expect(request?.body).toBeInstanceOf(URLSearchParams)
		expect((request?.body as URLSearchParams).get("code")).toBe("code+with&reserved")
		expect((request?.body as URLSearchParams).get("code_verifier")).toHaveLength(43)
		expect(storage.get("opengates.oauth.pending")).toBeUndefined()
		expect(JSON.parse(storage.get(OPENGATES_SESSION_KEY)!)).toMatchObject({
			accessToken: token.access_token,
			refreshToken: token.refresh_token,
		})
		expect(listener.mock.calls.at(-1)).toEqual([
			{
				user: {
					uid: profile.sub,
					displayName: profile.name,
					email: profile.email,
					photoUrl: undefined,
				},
			},
		])
		expect(JSON.stringify(listener.mock.calls)).not.toContain(token.access_token)
		await expect(auth.getAccessToken()).resolves.toBe(token.access_token)
	})

	it.each([
		"wrong-state",
		"wrong-host",
		"wrong-scheme",
		"duplicate-state",
		"missing-code",
		"expired",
		"denied",
	])("rejects %s callbacks without exchanging credentials", async (kind) => {
		const { auth, dependencies, callback } = setup()
		let url = await callback()
		if (kind === "wrong-state") url.searchParams.set("state", "wrong")
		if (kind === "wrong-host") url.host = "other.extension"
		if (kind === "wrong-scheme") url = new URL(url.toString().replace("vscode:", "http:"))
		if (kind === "duplicate-state") url.searchParams.append("state", "duplicate")
		if (kind === "missing-code") url.searchParams.delete("code")
		if (kind === "denied") url.searchParams.set("error", "access_denied")
		if (kind === "expired") vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60_000)
		await expect(auth.handleCallback(url)).rejects.toThrow()
		expect(dependencies.fetch).not.toHaveBeenCalled()
	})

	it("consumes successful callbacks and rejects replay", async () => {
		const { auth, dependencies, callback } = setup()
		const url = await callback()
		dependencies.fetch.mockResolvedValueOnce(json(token)).mockResolvedValueOnce(json(profile))
		await auth.handleCallback(url)
		await expect(auth.handleCallback(url)).rejects.toThrow("callback validation")
		expect(dependencies.fetch).toHaveBeenCalledTimes(2)
	})

	it("reports a browser-open failure and removes the pending handshake", async () => {
		const { auth, dependencies, storage } = setup()
		dependencies.openUrl.mockResolvedValue(false)
		await expect(auth.login()).rejects.toThrow("Could not open")
		expect(storage.get("opengates.oauth.pending")).toBeUndefined()
	})

	it("accepts the server's empty profile picture for accounts without an avatar", async () => {
		const { auth, dependencies, callback } = setup()
		dependencies.fetch.mockResolvedValueOnce(json(token)).mockResolvedValueOnce(json({ ...profile, picture: "" }))
		await auth.handleCallback(await callback())
		await expect(auth.requireAuthentication()).resolves.toBeUndefined()
	})

	it("reports the failed stage without exposing response contents", async () => {
		const { auth, dependencies, callback } = setup()
		dependencies.fetch.mockRejectedValueOnce(new Error("sensitive transport details"))
		await expect(auth.handleCallback(await callback())).rejects.toThrow("token exchange")
		expect(dependencies.reportError).toHaveBeenCalledWith("Opengates callback failed during token exchange.")
		expect(JSON.stringify(dependencies.reportError.mock.calls)).not.toContain("sensitive")
	})

	it("restores an existing session and obtains the OIDC user profile", async () => {
		const { auth, dependencies } = setup({ accessToken: "saved", expiresAt: Date.now() + 3600_000 })
		dependencies.fetch.mockResolvedValueOnce(json(profile))
		const listener = vi.fn(async () => {})
		await auth.subscribe(listener)
		await expect(auth.requireAuthentication()).resolves.toBeUndefined()
		expect(listener).toHaveBeenLastCalledWith({ user: expect.objectContaining({ uid: profile.sub }) })
		expect(dependencies.fetch.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer saved" })
	})

	it("refreshes an expired session once for concurrent requests and retains an unrotated refresh token", async () => {
		const { auth, dependencies, storage } = await signedIn()
		vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600_000)
		dependencies.fetch.mockResolvedValueOnce(json({ ...token, access_token: "new-access", refresh_token: undefined }))
		await expect(Promise.all([auth.getAccessToken(), auth.getAccessToken()])).resolves.toEqual(["new-access", "new-access"])
		expect(dependencies.fetch).toHaveBeenCalledTimes(3)
		const request = dependencies.fetch.mock.calls[2][1]
		expect((request?.body as URLSearchParams).get("grant_type")).toBe("refresh_token")
		expect(JSON.parse(storage.get(OPENGATES_SESSION_KEY)!)).toMatchObject({
			accessToken: "new-access",
			refreshToken: "test-refresh",
		})
	})

	it("clears rejected refresh credentials and publishes signed-out state", async () => {
		const { auth, dependencies, storage } = await signedIn()
		const listener = vi.fn(async () => {})
		await auth.subscribe(listener)
		dependencies.fetch.mockResolvedValueOnce(json({ error: "invalid_grant" }, 400))
		await expect(auth.getAccessToken(true)).rejects.toThrow("rejected")
		expect(storage.has(OPENGATES_SESSION_KEY)).toBe(false)
		expect(listener).toHaveBeenLastCalledWith({ user: undefined })
	})

	it("preserves stored credentials on transient refresh failures", async () => {
		const { auth, dependencies, storage } = await signedIn()
		dependencies.fetch.mockResolvedValueOnce(json({ error: "temporarily_unavailable" }, 503))
		await expect(auth.getAccessToken(true)).rejects.toThrow("503")
		expect(storage.has(OPENGATES_SESSION_KEY)).toBe(true)
		await expect(auth.getAccessToken()).resolves.toBe(token.access_token)
	})

	it("does not resurrect a session when logout races with refresh", async () => {
		const { auth, dependencies, storage } = await signedIn()
		let resolve!: (response: Response) => void
		dependencies.fetch.mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done
				}),
		)
		const refresh = auth.getAccessToken(true)
		await auth.logout()
		resolve(json({ ...token, access_token: "late-access" }))
		await expect(refresh).rejects.toThrow("changed")
		expect(storage.has(OPENGATES_SESSION_KEY)).toBe(false)
		await expect(auth.requireAuthentication()).rejects.toThrow("Sign in")
	})

	it("does not claim authentication when restoring fails", async () => {
		const { auth, dependencies, storage } = setup({ accessToken: "saved", expiresAt: Date.now() + 3600_000 })
		dependencies.fetch.mockRejectedValueOnce(new Error("Network down"))
		const listener = vi.fn(async () => {})
		await auth.subscribe(listener)
		expect(dependencies.reportError).toHaveBeenCalled()
		expect(storage.has(OPENGATES_SESSION_KEY)).toBe(true)
		await expect(auth.requireAuthentication()).rejects.toThrow("profile")
	})
})

describe("Opengates gateway requests", () => {
	it("uses the selected model in the actual gateway provider configuration", async () => {
		const { auth } = await signedIn()
		vi.spyOn(OpengatesAuthService, "get").mockReturnValue(auth)
		expect(getOpengatesProviderConfig({ actModeOpenAiModelId: "ola-code-reason" }, "act")).toMatchObject({
			modelId: "ola-code-reason",
			providerId: "openai-compatible",
			baseUrl: OPENGATES_API_BASE_URL,
		})
		expect(getOpengatesProviderConfig({ planModeOpenAiModelId: "ola-code-reason" }, "plan")?.modelId).toBe("ola-code-reason")
	})
	it("resolves only supported gateway models in either mode", () => {
		expect(resolveOpengatesModel(undefined, "act")).toBe("ola-code-fast")
		expect(resolveOpengatesModel({ actModeOpenAiModelId: "ola-code-reason" }, "act")).toBe("ola-code-reason")
		expect(resolveOpengatesModel({ planModeOpenAiModelId: "ola-code-reason" }, "plan")).toBe("ola-code-reason")
		expect(resolveOpengatesModel({ actModeOpenAiModelId: "ola-code-pro" }, "act")).toBe("ola-code-pro")
		expect(resolveOpengatesModel({ actModeOpenAiModelId: "unrelated-model" }, "act")).toBe("ola-code-fast")
	})
	it("preserves the base fetch preconnect hook", () => {
		const { auth } = setup()
		const preconnect = vi.fn()
		const baseFetch = Object.assign(vi.fn<typeof globalThis.fetch>(), { preconnect })
		const wrappedFetch = createOpengatesFetch(auth, baseFetch)
		const wrappedPreconnect = Reflect.get(wrappedFetch, "preconnect")
		expect(typeof wrappedPreconnect).toBe("function")
		if (typeof wrappedPreconnect === "function")
			wrappedPreconnect("https://ola-pilot-api.proudglacier-876118b2.eastus2.azurecontainerapps.io")
		expect(preconnect).toHaveBeenCalledWith("https://ola-pilot-api.proudglacier-876118b2.eastus2.azurecontainerapps.io")
	})

	it("attaches the current bearer token, preserving headers and request body", async () => {
		const { auth } = await signedIn()
		const baseFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ choices: [] }))
		await createOpengatesFetch(auth, baseFetch)(`${OPENGATES_API_BASE_URL}/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: "Bearer stale" },
			body: JSON.stringify({ model: "ola-code-fast", messages: [] }),
		})

		const request = baseFetch.mock.calls[0][0] as Request
		expect(request.headers.get("authorization")).toBe("Bearer test-access")
		expect(request.headers.get("content-type")).toBe("application/json")
		expect(request.redirect).toBe("error")
		expect(await request.json()).toEqual({ model: "ola-code-fast", messages: [] })
	})

	it("correlates only shadow-enabled generation requests to the stable task id", async () => {
		const { auth } = await signedIn()
		const correlation = createOpengatesTaskCorrelation("task-stable-1")
		const baseFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ choices: [] }))
		const wrappedFetch = createOpengatesFetch(auth, baseFetch, correlation)

		await wrappedFetch(`${OPENGATES_API_BASE_URL}/chat/completions`, { method: "POST" })
		expect((baseFetch.mock.calls[0][0] as Request).headers.get("X-Ola-Agent-Task-Id")).toBeNull()
		expect((baseFetch.mock.calls[0][0] as Request).headers.get("X-Ola-Session-Id")).toBe("task-stable-1")

		correlation.enabled = true
		await wrappedFetch(`${OPENGATES_API_BASE_URL}/chat/completions`, { method: "POST" })
		expect((baseFetch.mock.calls[1][0] as Request).headers.get("X-Ola-Agent-Task-Id")).toBe("task-stable-1")

		await wrappedFetch(`${OPENGATES_API_BASE_URL}/models`, { method: "GET" })
		expect((baseFetch.mock.calls[2][0] as Request).headers.get("X-Ola-Agent-Task-Id")).toBeNull()
		expect((baseFetch.mock.calls[2][0] as Request).headers.get("X-Ola-Session-Id")).toBeNull()
	})

	it("preserves unrecognized final shadow metadata in the gateway response body", async () => {
		const { auth } = await signedIn()
		const payload = 'data: {"choices":[],"ola_shadow":{"enforced":false,"calls":1}}\n\n'
		const baseFetch = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(new Response(payload, { headers: { "Content-Type": "text/event-stream" } }))

		const response = await createOpengatesFetch(auth, baseFetch)(`${OPENGATES_API_BASE_URL}/chat/completions`, {
			method: "POST",
			body: JSON.stringify({ model: "ola-code-fast" }),
		})

		expect(await response.text()).toBe(payload)
	})

	it("refreshes and retries exactly once on a 401", async () => {
		const { auth, dependencies } = await signedIn()
		dependencies.fetch.mockResolvedValueOnce(json({ ...token, access_token: "refreshed" }))
		const baseFetch = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValueOnce(json({}, 401))
			.mockResolvedValueOnce(json({ choices: [] }))
		const response = await createOpengatesFetch(auth, baseFetch)(`${OPENGATES_API_BASE_URL}/chat/completions`, {
			method: "POST",
			body: "request-body",
		})
		expect(response.status).toBe(200)
		expect(baseFetch).toHaveBeenCalledTimes(2)
		const retry = baseFetch.mock.calls[1][0] as Request
		expect(retry.headers.get("authorization")).toBe("Bearer refreshed")
		expect(await retry.text()).toBe("request-body")
	})

	it("signs out if a refreshed token is rejected", async () => {
		const { auth, dependencies, storage } = await signedIn()
		dependencies.fetch.mockResolvedValueOnce(json({ ...token, access_token: "refreshed" }))
		const baseFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({}, 401))
		const response = await createOpengatesFetch(auth, baseFetch)(`${OPENGATES_API_BASE_URL}/chat/completions`)
		expect(response.status).toBe(401)
		expect(baseFetch).toHaveBeenCalledTimes(2)
		expect(storage.has(OPENGATES_SESSION_KEY)).toBe(false)
	})

	it.each([403, 429, 500])("does not refresh or sign out for HTTP %s", async (status) => {
		const { auth, dependencies, storage } = await signedIn()
		const baseFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({}, status))
		await createOpengatesFetch(auth, baseFetch)(`${OPENGATES_API_BASE_URL}/chat/completions`)
		expect(baseFetch).toHaveBeenCalledTimes(1)
		expect(dependencies.fetch).toHaveBeenCalledTimes(2)
		expect(storage.has(OPENGATES_SESSION_KEY)).toBe(true)
	})

	it.each([
		"https://example.test/v1/chat/completions",
		"http://ola-pilot-api.proudglacier-876118b2.eastus2.azurecontainerapps.io/v1/chat/completions",
		"https://ola-pilot-api.proudglacier-876118b2.eastus2.azurecontainerapps.io/other",
	])("refuses to send credentials to %s", async (destination) => {
		const { auth } = await signedIn()
		const baseFetch = vi.fn<typeof globalThis.fetch>()
		await expect(createOpengatesFetch(auth, baseFetch)(destination)).rejects.toThrow("outside")
		expect(baseFetch).not.toHaveBeenCalled()
	})

	it("blocks requests when signed out", async () => {
		const { auth } = setup()
		const baseFetch = vi.fn<typeof globalThis.fetch>()
		await expect(createOpengatesFetch(auth, baseFetch)(`${OPENGATES_API_BASE_URL}/chat/completions`)).rejects.toThrow(
			"Sign in",
		)
		expect(baseFetch).not.toHaveBeenCalled()
	})
})
