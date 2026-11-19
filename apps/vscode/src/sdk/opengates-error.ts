const ERROR_MESSAGES: Record<string, string> = {
	authentication_required: "Sign in again to continue using Ola.",
	context_length_exceeded: "This conversation is too large. Compact it using /compact, or start a new task with a summary.",
	unsupported_capability: "This request contains unsupported content. Remove unsupported attachments or start a new task.",
	temporarily_unavailable: "Ola is temporarily unavailable. Please try again later.",
	provider_busy: "Ola is busy right now. Please try again later.",
	provider_throttled: "Ola is busy right now. Please try again later.",
	provider_rate_limited: "Ola is busy right now. Please try again later.",
	provider_risk_limit_exceeded: "Ola is temporarily paused. Please try again later. This pause is not a Sparks balance error.",
	sparks_risk_limit_exceeded: "Ola is temporarily paused. Please try again later. This pause is not a Sparks balance error.",
	insufficient_sparks: "There aren't enough Sparks for this request. Check your Sparks balance before trying again.",
	allowance_exhausted:
		"You've used all your Sparks for now. Get a bundle or top-up under Sparks in your Ola account to keep going.",
	bure_daily_cap:
		"Today's free Sparks have all been used. Bure refills at midnight, East Africa Time; a bundle or top-up works right away.",
	sparks_too_low_for_mode:
		"Deep needs at least 150,000 Sparks to start. Switch to Quick or Balanced, or get a bundle or top-up under Sparks.",
	request_exceeds_allowance:
		"This request needs more Sparks than you have left. Try Quick, or get a bundle or top-up under Sparks.",
	biashara_limit:
		"You've used this month's Sparks from your organisation. Ask your organisation for more in Ola, under Sparks, or choose to use your own Sparks there.",
	biashara_pool:
		"Your organisation is out of Sparks for the team. Ask your organisation to add more, or choose to use your own Sparks in Ola, under Sparks.",
}

// Running out of Sparks is not fixed by waiting a few seconds: these messages say when Sparks come back
// instead, so no "Try again in N seconds" is added (the wait can run to the end of the month).
const SPARKS_CODES = new Set([
	"allowance_exhausted",
	"bure_daily_cap",
	"sparks_too_low_for_mode",
	"request_exceeds_allowance",
	"biashara_limit",
	"biashara_pool",
])

export interface OpengatesFailure {
	source: "ola"
	code: string
	message: string
	status: number
	request_id?: string
	retry_after_seconds?: number
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function requestId(value: unknown): string | undefined {
	return typeof value === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(value) ? value : undefined
}

function retryAfter(value: unknown, now: number): number | undefined {
	const seconds =
		typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined
	if (seconds !== undefined) return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined
	if (typeof value !== "string") return undefined
	const date = Date.parse(value)
	return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : undefined
}

/** Read only a bounded error body; never propagate upstream text or route details. */
export async function sanitizeOpengatesFailure(response: Response): Promise<Response> {
	let payload: Record<string, unknown> | undefined
	const reader = response.body?.getReader()
	if (reader) {
		try {
			let text = ""
			let bytes = 0
			const decoder = new TextDecoder()
			for (;;) {
				const part = await reader.read()
				if (part.done) {
					payload = record(JSON.parse(text + decoder.decode()))
					break
				}
				bytes += part.value.byteLength
				if (bytes > 16_384) break
				text += decoder.decode(part.value, { stream: true })
			}
		} catch {
			// Non-JSON failures still get a safe, actionable message.
		} finally {
			await reader.cancel().catch(() => undefined)
		}
	}
	const detail = record(payload?.error) ?? payload
	const rawCode = detail?.code ?? payload?.code
	const code =
		typeof rawCode === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(rawCode)
			? rawCode
			: response.status === 401
				? "authentication_required"
				: response.status === 429
					? "provider_busy"
					: "temporarily_unavailable"
	const id = requestId(response.headers.get("x-request-id")) ?? requestId(detail?.request_id ?? payload?.request_id)
	const wait = retryAfter(response.headers.get("retry-after") ?? detail?.retry_after_seconds, Date.now())
	const failure: OpengatesFailure = {
		source: "ola",
		code,
		status: response.status,
		message:
			ERROR_MESSAGES[code] ??
			(response.status === 401
				? "Sign in again to continue using Ola."
				: "Ola couldn't complete this request. Please try again later."),
		...(id ? { request_id: id } : {}),
		...(wait !== undefined ? { retry_after_seconds: wait } : {}),
	}
	if (wait !== undefined && !SPARKS_CODES.has(code)) failure.message += ` Try again in ${wait} seconds.`
	// Keep the envelope in the message: the SDK forwards error.message through
	// persisted events, whereas arbitrary response fields would be flattened away.
	return new Response(JSON.stringify({ error: { code, message: JSON.stringify(failure) } }), {
		status: response.status,
		headers: {
			"Content-Type": "application/json",
			...(id ? { "x-request-id": id } : {}),
			...(wait !== undefined ? { "retry-after": String(wait) } : {}),
		},
	})
}

export function parseOpengatesFailure(message: string): OpengatesFailure | undefined {
	try {
		const start = message.indexOf("{")
		const end = message.lastIndexOf("}")
		const parsed = record(JSON.parse(start >= 0 ? message.slice(start, end + 1) : message))
		if (
			parsed?.source === "ola" &&
			typeof parsed.code === "string" &&
			typeof parsed.message === "string" &&
			typeof parsed.status === "number"
		) {
			return parsed as unknown as OpengatesFailure
		}
	} catch {
		// Ordinary provider failures use the existing translation path.
	}
	return undefined
}
