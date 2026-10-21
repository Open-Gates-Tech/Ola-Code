import type { ProviderConfig } from "@cline/llms"
import type { ApiConfiguration } from "@/shared/api"
import { fetch } from "@/shared/net"
import { resolveOpengatesModel } from "@/shared/opengates-models"
import type { Mode } from "@/shared/storage/types"
import { OpengatesAuthService } from "./opengates-auth-service"

export const OPENGATES_API_BASE_URL = "https://ola-pilot-api.proudglacier-876118b2.eastus2.azurecontainerapps.io/v1"

type FetchWithOptionalPreconnect = typeof globalThis.fetch & {
	preconnect?: (...args: unknown[]) => unknown
}

export function createOpengatesFetch(
	auth: OpengatesAuthService,
	baseFetch: typeof globalThis.fetch = fetch,
): typeof globalThis.fetch {
	const authenticatedFetch = async (
		input: Parameters<typeof globalThis.fetch>[0],
		init?: Parameters<typeof globalThis.fetch>[1],
	): Promise<Response> => {
		await auth.requireAuthentication()
		const request = new Request(input, init)
		const url = new URL(request.url)
		if (url.origin !== new URL(OPENGATES_API_BASE_URL).origin || !url.pathname.startsWith("/v1/")) {
			throw new Error("Refusing to send Opengates credentials outside the Opengates gateway.")
		}
		const send = async (token: string) => {
			const headers = new Headers(request.headers)
			headers.set("Authorization", `Bearer ${token}`)
			return baseFetch(new Request(request.clone(), { headers, redirect: "error" }))
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
		return response
	}
	const baseFetchWithPreconnect = baseFetch as FetchWithOptionalPreconnect
	return Object.assign(authenticatedFetch, {
		preconnect:
			typeof baseFetchWithPreconnect.preconnect === "function"
				? baseFetchWithPreconnect.preconnect.bind(baseFetch)
				: () => undefined,
	})
}

export function getOpengatesProviderConfig(config?: ApiConfiguration, mode: Mode = "act"): ProviderConfig | undefined {
	const auth = OpengatesAuthService.get()
	if (!auth) return undefined
	return {
		providerId: "openai-compatible",
		modelId: resolveOpengatesModel(config, mode),
		baseUrl: OPENGATES_API_BASE_URL,
		// Actual credentials are resolved by fetch, never serialized into SDK session configuration.
		apiKey: "opengates-session",
		fetch: createOpengatesFetch(auth),
	}
}
