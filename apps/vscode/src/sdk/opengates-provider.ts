import type { ProviderConfig } from "@cline/llms"
import type { ApiConfiguration } from "@/shared/api"
import { fetch } from "@/shared/net"
import { getOpengatesModelInfo, OPENGATES_MAX_OUTPUT_TOKENS, resolveOpengatesModel } from "@/shared/opengates-models"
import type { Mode } from "@/shared/storage/types"
import { OLA_WORKSPACE_HEADER, OlaWorkspaceChoice } from "./ola-workspace"
import { OpengatesAuthService } from "./opengates-auth-service"
import { sanitizeOpengatesFailure } from "./opengates-error"
import type { OpengatesTaskCorrelation } from "./opengates-task-budget"

export const OPENGATES_API_BASE_URL = "https://ola-pilot-api.proudglacier-876118b2.eastus2.azurecontainerapps.io/v1"

type FetchWithOptionalPreconnect = typeof globalThis.fetch & {
	preconnect?: (...args: unknown[]) => unknown
}

export function createOpengatesFetch(
	auth: OpengatesAuthService,
	baseFetch: typeof globalThis.fetch = fetch,
	taskCorrelation?: OpengatesTaskCorrelation,
): typeof globalThis.fetch {
	const authenticatedFetch = async (
		input: Parameters<typeof globalThis.fetch>[0],
		init?: Parameters<typeof globalThis.fetch>[1],
	): Promise<Response> => {
		await auth.requireAuthentication()
		const request = new Request(input, init)
		const url = new URL(request.url)
		if (url.pathname === "/v1/chat/completions" && !request.headers.has("Idempotency-Key")) {
			request.headers.set("Idempotency-Key", crypto.randomUUID())
		}
		if (
			url.pathname === "/v1/chat/completions" &&
			request.body !== null &&
			request.headers.get("Content-Type")?.includes("application/json")
		) {
			const body: unknown = await request.clone().json()
			if (body && typeof body === "object" && "model" in body && body.model === "ola-code-pro") {
				request.headers.set("X-Ola-Premium-Consent", "true")
			}
		}
		if (url.origin !== new URL(OPENGATES_API_BASE_URL).origin || !url.pathname.startsWith("/v1/")) {
			throw new Error("Refusing to send Opengates credentials outside the Opengates gateway.")
		}
		// Chats run in the workspace Ola Code works in; everything else (account, checkout) stays personal.
		const workspace =
			url.pathname === "/v1/chat/completions" && !request.headers.has(OLA_WORKSPACE_HEADER)
				? OlaWorkspaceChoice.get()?.current()
				: undefined
		if (workspace) request.headers.set(OLA_WORKSPACE_HEADER, workspace.id)
		const send = async (token: string) => {
			const headers = new Headers(request.headers)
			headers.set("Authorization", `Bearer ${token}`)
			if (taskCorrelation && url.pathname === "/v1/chat/completions") {
				// Keeps one task on one route so the provider's prompt cache survives agent steps.
				headers.set("X-Ola-Session-Id", taskCorrelation.taskId)
				if (taskCorrelation.enabled) headers.set("X-Ola-Agent-Task-Id", taskCorrelation.taskId)
			}
			try {
				return await baseFetch(new Request(request.clone(), { headers, redirect: "error" }))
			} catch {
				request.signal.throwIfAborted()
				throw new Error(
					JSON.stringify({
						source: "ola",
						code: "connection_interrupted",
						status: 0,
						message:
							"The connection to Ola was interrupted. The request was not automatically retried. Please check your connection.",
					}),
				)
			}
		}
		const token = await auth.getAccessToken()
		let response = await send(token)
		if (response.status === 401) {
			await response.body?.cancel()
			const currentToken = await auth.getAccessToken()
			const refreshed = currentToken === token ? await auth.getAccessToken(true) : currentToken
			response = await send(refreshed)
			if (response.status === 401) await auth.logout()
		}
		if (response.ok) return response
		const failure = await sanitizeOpengatesFailure(response)
		if (workspace && failure.status === 403) {
			const code = await failure
				.clone()
				.json()
				.then((body: { error?: { code?: unknown } }) => body.error?.code)
				.catch(() => undefined)
			// No longer a member: later messages go to the personal workspace; this one says what happened.
			if (code === "workspace_forbidden" && OlaWorkspaceChoice.get()?.current()?.id === workspace.id) {
				await OlaWorkspaceChoice.get()?.set(undefined)
			}
		}
		return failure
	}
	const baseFetchWithPreconnect = baseFetch as FetchWithOptionalPreconnect
	return Object.assign(authenticatedFetch, {
		preconnect:
			typeof baseFetchWithPreconnect.preconnect === "function"
				? baseFetchWithPreconnect.preconnect.bind(baseFetch)
				: () => undefined,
	})
}

export function getOpengatesProviderConfig(
	config?: ApiConfiguration,
	mode: Mode = "act",
	taskCorrelation?: OpengatesTaskCorrelation,
): ProviderConfig | undefined {
	const auth = OpengatesAuthService.get()
	if (!auth) return undefined
	const modelId = resolveOpengatesModel(config, mode)
	return {
		providerId: "openai-compatible",
		modelId,
		knownModels: { [modelId]: getOpengatesModelInfo(modelId) },
		maxOutputTokens: OPENGATES_MAX_OUTPUT_TOKENS,
		retryOwner: "upstream",
		baseUrl: OPENGATES_API_BASE_URL,
		// Actual credentials are resolved by fetch, never serialized into SDK session configuration.
		apiKey: "opengates-session",
		fetch: createOpengatesFetch(auth, fetch, taskCorrelation),
	}
}
