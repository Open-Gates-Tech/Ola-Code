import { describe, expect, it, vi } from "vitest"
import { createOpengatesUpgradeCheckout, fetchOpengatesAccount } from "./opengates-account"
import type { OpengatesAuthService } from "./opengates-auth-service"

const auth = { getUser: async () => ({ uid: "u1", email: "jane@example.com" }) } as unknown as OpengatesAuthService
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const catalog = {
	billing_enabled: true,
	data: [
		{ id: "topup", currency: "KES", amount: 10000, credits: 100000 },
		{ id: "pro-monthly", currency: "KES", amount: 65000, tier: "pro", days: 30 },
	],
}

function fakeFetch(routes: Record<string, () => Response>) {
	return vi.fn(async (input: Parameters<typeof fetch>[0]) => {
		const path = new URL(String(input)).pathname.replace(/^\/v1/, "")
		const route = routes[path]
		return route ? route() : json({}, 404)
	}) as unknown as typeof fetch
}

describe("Opengates account", () => {
	it("maps a free account with allowances and the Pro upgrade offer", async () => {
		const fetcher = fakeFetch({
			"/account": () =>
				json({
					tier: "free",
					status: "active",
					credits_remaining: 1200,
					fast_remaining: 250000,
					reason_remaining: 0,
					reset_at: "2026-11-01T00:00:00Z",
					expires_at: "0001-01-01T00:00:00Z",
				}),
			"/billing/products": () => json(catalog),
		})
		const account = await fetchOpengatesAccount(auth, fetcher)
		expect(account).toMatchObject({
			tier: "free",
			fastRemaining: 250000,
			fastAllowance: 500000,
			reasonAllowance: 0,
			resetAt: "2026-11-01T00:00:00.000Z",
			expiresAt: undefined,
			upgradeProduct: { id: "pro-monthly", currency: "KES", amount: 65000, days: 30 },
		})
	})

	it("keeps the account visible when the catalog fails, and skips it for Pro", async () => {
		const products = vi.fn(() => json({}, 503))
		const free = await fetchOpengatesAccount(
			auth,
			fakeFetch({
				"/account": () =>
					json({ tier: "free", status: "active", credits_remaining: 0, fast_remaining: 1, reason_remaining: 0 }),
				"/billing/products": products,
			}),
		)
		expect(free.upgradeProduct).toBeUndefined()

		products.mockClear()
		const pro = await fetchOpengatesAccount(
			auth,
			fakeFetch({
				"/account": () =>
					json({ tier: "pro", status: "active", credits_remaining: 0, fast_remaining: 1, reason_remaining: 1 }),
				"/billing/products": products,
			}),
		)
		expect(pro).toMatchObject({ fastAllowance: 10_000_000, reasonAllowance: 1_500_000 })
		expect(products).not.toHaveBeenCalled()
	})

	it("creates a Pro checkout with the signed-in email", async () => {
		let body: unknown
		const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
			const path = new URL(String(input)).pathname
			if (path === "/v1/billing/products") return json(catalog)
			body = JSON.parse(String(init?.body))
			return json({ reference: "r1", checkout_url: "https://checkout.paystack.com/abc" }, 201)
		}) as unknown as typeof fetch
		await expect(createOpengatesUpgradeCheckout(auth, fetcher)).resolves.toBe("https://checkout.paystack.com/abc")
		expect(body).toEqual({ product_id: "pro-monthly", email: "jane@example.com" })
	})

	it("rejects insecure checkout URLs", async () => {
		const fetcher = fakeFetch({
			"/billing/products": () => json(catalog),
			"/billing/checkout": () => json({ checkout_url: "http://checkout.example/abc" }, 201),
		})
		await expect(createOpengatesUpgradeCheckout(auth, fetcher)).rejects.toThrow("insecure")
	})
})
