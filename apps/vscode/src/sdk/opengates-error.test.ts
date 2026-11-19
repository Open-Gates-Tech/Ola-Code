import { describe, expect, it } from "vitest"
import { ClineError } from "@/services/error/ClineError"
import { reshapeErrorForWebview } from "./message-translator"
import { parseOpengatesFailure, sanitizeOpengatesFailure } from "./opengates-error"

describe("Ola failure propagation", () => {
	it.each([
		["context_length_exceeded", 400],
		["unsupported_capability", 400],
		["temporarily_unavailable", 503],
		["provider_risk_limit_exceeded", 429],
	] as const)("preserves %s and request correlation without upstream details", async (code, status) => {
		const response = await sanitizeOpengatesFailure(
			new Response(
				JSON.stringify({
					error: { code, message: "SECRET upstream route", scope: "rolling_unknown", api_key: "SECRET" },
				}),
				{ status, headers: { "x-request-id": "req-123", "retry-after": "12" } },
			),
		)
		const body = await response.json()
		const translated = reshapeErrorForWebview({ message: body.error.message }, "openai-compatible")
		expect(JSON.parse(translated)).toMatchObject({
			source: "ola",
			code,
			status,
			request_id: "req-123",
			retry_after_seconds: 12,
		})
		expect(translated).not.toContain("SECRET")
		expect(translated).not.toContain("rolling_unknown")
		expect(translated).not.toContain("openai-compatible")
		expect(ClineError.parse(translated)?._error.source).toBe("ola")
	})

	it("recovers the safe envelope from terminal SDK overflow guidance", () => {
		const failure = { source: "ola", code: "context_length_exceeded", status: 400, message: "Compact using /compact." }
		expect(parseOpengatesFailure(`Compact the conversation (provider reported: ${JSON.stringify(failure)})`)).toEqual(failure)
	})

	it("bounds error body reading and uses safe generic guidance", async () => {
		const response = await sanitizeOpengatesFailure(new Response("SECRET".repeat(10_000), { status: 503 }))
		expect(await response.text()).not.toContain("SECRET")
	})

	it("supports HTTP-date retry timing and ignores invalid request ids", async () => {
		const response = await sanitizeOpengatesFailure(
			new Response("{}", {
				status: 429,
				headers: { "retry-after": new Date(Date.now() + 60_000).toUTCString(), "x-request-id": "invalid secret id" },
			}),
		)
		const failure = JSON.parse((await response.json()).error.message)
		expect(failure.retry_after_seconds).toBeGreaterThanOrEqual(59)
		expect(failure.request_id).toBeUndefined()
	})

	it.each([
		["bure_daily_cap", "Bure refills at midnight"],
		["allowance_exhausted", "Get a bundle or top-up"],
		["sparks_too_low_for_mode", "Deep needs at least 150,000 Sparks"],
		["biashara_limit", "Ask your organisation for more"],
		["biashara_pool", "Your organisation is out of Sparks"],
	] as const)("explains %s without telling people to wait seconds", async (code, text) => {
		const response = await sanitizeOpengatesFailure(
			new Response(JSON.stringify({ error: { code, message: "upstream" } }), {
				status: 429,
				headers: { "retry-after": "950000" },
			}),
		)
		const failure = JSON.parse((await response.json()).error.message)
		expect(failure.message).toContain(text)
		expect(failure.message).not.toContain("Try again in")
		expect(failure.retry_after_seconds).toBe(950000)
	})
})
