import { describe, expect, it, vi } from "vitest"
import { OpengatesAccount } from "@/shared/proto/cline/account"
import { createOpengatesPlanCheckout, fetchOpengatesAccount } from "./opengates-account"
import type { OpengatesAuthService } from "./opengates-auth-service"

const auth = { getUser: async () => ({ uid: "u", email: "pilot@example.com" }) } as unknown as OpengatesAuthService
const wallet = {
	version: "sparks-v1",
	unit: "nano_usd",
	grant_nusd: 5_000_000_000,
	used_nusd: 1,
	held_nusd: 10,
	purchased_nusd: 1000,
	purchased_held_nusd: 2,
	period: "p",
	reset_at: "2026-11-22T00:00:00Z",
}
const catalog = {
	billing_enabled: true,
	data: [{ id: "ultra-usd", currency: "USD", amount: 1500, tier: "ultra", days: 0, billing_version: "sparks-v1" }],
}
function fetcherFor(sparks: unknown = wallet, enabled = true) {
	return vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const path = new URL(String(input)).pathname
		if (path.endsWith("/account"))
			return Response.json({
				tier: "pro",
				status: "active",
				credits_remaining: 0,
				fast_remaining: 0,
				reason_remaining: 0,
				sparks,
			})
		if (path.endsWith("/products")) return Response.json({ ...catalog, billing_enabled: enabled })
		if (path.endsWith("/checkout")) {
			expect(JSON.parse(String(init?.body))).toEqual({ product_id: "ultra-usd", email: "pilot@example.com" })
			return Response.json({ checkout_url: "https://checkout.paystack.com/pilot" })
		}
		return Response.json({}, { status: 404 })
	}) as unknown as typeof fetch
}

describe("Sparks API contract", () => {
	it("preserves fractional wallet precision and plan products through protobuf", async () => {
		const parsed = await fetchOpengatesAccount(auth, fetcherFor())
		const decoded = OpengatesAccount.decode(OpengatesAccount.encode(parsed).finish())
		expect(decoded.sparks).toMatchObject({ version: "sparks-v1", usedNusd: 1, heldNusd: 10, purchasedHeldNusd: 2 })
		expect(decoded.products[0]).toMatchObject({ tier: "ultra", amount: 1500, billingVersion: "sparks-v1" })
		expect(decoded.billingEnabled).toBe(true)
	})
	it.each([
		{ ...wallet, held_nusd: 5_000_000_000 },
		{ ...wallet, used_nusd: -1 },
		{ ...wallet, purchased_held_nusd: 1001 },
		{ ...wallet, grant_nusd: Number.MAX_SAFE_INTEGER + 1 },
		{ ...wallet, unit: "tokens" },
	])("rejects invalid wallet data instead of displaying a plausible fallback", async (invalid) => {
		await expect(fetchOpengatesAccount(auth, fetcherFor(invalid))).rejects.toThrow()
	})
	it("checks out the selected server product", async () => {
		await expect(createOpengatesPlanCheckout(auth, "ultra-usd", fetcherFor())).resolves.toBe(
			"https://checkout.paystack.com/pilot",
		)
	})
	it("does not create checkout when disabled or the product is not in the catalog", async () => {
		await expect(createOpengatesPlanCheckout(auth, "ultra-usd", fetcherFor(wallet, false))).rejects.toThrow("not available")
		await expect(createOpengatesPlanCheckout(auth, "unknown", fetcherFor())).rejects.toThrow("not available")
	})
})
