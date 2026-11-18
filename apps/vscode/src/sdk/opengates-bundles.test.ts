import { describe, expect, it, vi } from "vitest"
import { OpengatesAccount } from "@/shared/proto/cline/account"
import { createOpengatesPlanCheckout, fetchOpengatesAccount } from "./opengates-account"
import type { OpengatesAuthService } from "./opengates-auth-service"

const auth = { getUser: async () => ({ uid: "u", email: "pilot@example.com" }) } as unknown as OpengatesAuthService
const siku = {
	id: "pay-1",
	product: "siku",
	granted_nusd: 230_000_000,
	used_nusd: 30_000_000,
	held_nusd: 0,
	starts_at: "2026-11-18T07:00:00.123456Z",
	expires_at: "2026-11-19T07:00:00.123456Z",
}
const wallet = {
	version: "sparks-v1",
	unit: "nano_usd",
	grant_nusd: 200_000_000,
	used_nusd: 0,
	held_nusd: 0,
	purchased_nusd: 0,
	purchased_held_nusd: 0,
	period: "p",
	reset_at: "2026-12-01T00:00:00Z",
	bundles: [siku, { ...siku, id: "pay-2", product: "usiku", windowed: true, from_hour: 23, to_hour: 5 }],
}
// The production catalogue's shape: plans in USD, bundles and top-ups in KES.
const catalog = {
	billing_enabled: true,
	not_on_sale: ["hadi-usiku"],
	data: [
		{ id: "pro-sparks-usd", currency: "USD", amount: 500, tier: "pro", days: 0, billing_version: "sparks-v1" },
		{
			id: "siku",
			currency: "KES",
			amount: 5000,
			billing_version: "sparks-v1",
			bundle: { name: "Siku", label: "One day", sparks: 230000, hours: 24 },
		},
		{
			id: "hadi-usiku",
			currency: "KES",
			amount: 4000,
			billing_version: "sparks-v1",
			bundle: { name: "Hadi Usiku", label: "Until midnight", sparks: 170000, until_midnight: true, sell_until_hour: 21 },
		},
		{
			id: "top-up-50",
			currency: "KES",
			amount: 5000,
			billing_version: "sparks-v1",
			bundle: { name: "Top-up 50", label: "Never expires", sparks: 200000, top_up: true },
		},
		{ id: "legacy-kes", currency: "KES", amount: 10000, credits: 100000 },
	],
}
const paystack = () => Response.json({ checkout_url: "https://checkout.paystack.com/pilot" })

function fetcherFor(checkout: (body: unknown) => Response = paystack) {
	return vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const path = new URL(String(input)).pathname
		if (path.endsWith("/account"))
			return Response.json({
				tier: "free",
				status: "active",
				credits_remaining: 0,
				fast_remaining: 0,
				reason_remaining: 0,
				sparks: wallet,
			})
		if (path.endsWith("/products")) return Response.json(catalog)
		if (path.endsWith("/checkout")) return checkout(JSON.parse(String(init?.body)))
		return Response.json({}, { status: 404 })
	}) as unknown as typeof fetch
}

describe("Sparks bundles in Ola Code", () => {
	it("loads bundles, top-ups and wallet bundles through protobuf, skipping legacy products", async () => {
		const account = OpengatesAccount.decode(OpengatesAccount.encode(await fetchOpengatesAccount(auth, fetcherFor())).finish())
		expect(account.products.map((p) => p.id)).toEqual(["pro-sparks-usd", "siku", "hadi-usiku", "top-up-50"])
		expect(account.products[1]).toMatchObject({
			currency: "KES",
			amount: 5000,
			onSale: true,
			bundle: { name: "Siku", sparks: 230000, hours: 24 },
		})
		expect(account.products[2]).toMatchObject({ onSale: false, bundle: { untilMidnight: true, sellUntilHour: 21 } })
		expect(account.products[3].bundle?.topUp).toBe(true)
		expect(account.sparks?.bundles).toHaveLength(2)
		expect(account.sparks?.bundles[1]).toMatchObject({
			product: "usiku",
			windowed: true,
			fromHour: 23,
			toHour: 5,
			usedNusd: 30_000_000,
		})
	})

	it("checks out a bundle, and refuses one that is not on sale", async () => {
		const checkout = vi.fn(paystack)
		await expect(createOpengatesPlanCheckout(auth, "siku", fetcherFor(checkout))).resolves.toBe(
			"https://checkout.paystack.com/pilot",
		)
		expect(checkout).toHaveBeenCalledWith({ product_id: "siku", email: "pilot@example.com" })
		await expect(createOpengatesPlanCheckout(auth, "hadi-usiku", fetcherFor())).rejects.toThrow(
			"Hadi Usiku is not sold at this hour",
		)
		await expect(createOpengatesPlanCheckout(auth, "legacy-kes", fetcherFor())).rejects.toThrow("not available")
	})
})
