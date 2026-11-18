import { describe, expect, it, vi } from "vitest"
import { createOpengatesPlanCheckout, fetchOpengatesAccount } from "./opengates-account"
import type { OpengatesAuthService } from "./opengates-auth-service"
import { subscriptionStatus } from "./opengates-subscription"

const auth = { getUser: async () => ({ uid: "u", email: "pilot@example.com" }) } as unknown as OpengatesAuthService
const mwezi = {
	id: "mwezi",
	currency: "KES",
	amount: 65000,
	billing_version: "sparks-v1",
	bundle: { name: "Mwezi", label: "30 days", sparks: 3400000, hours: 720 },
}
const pro = { id: "pro-sparks-usd", currency: "USD", amount: 500, tier: "pro", billing_version: "sparks-v1" }
const moving = {
	data: {
		subscription: {
			tier: "pro",
			product: pro,
			auto_renew: true,
			state: "active",
			period_end: "2026-12-17T21:30:00Z",
			card_last4: "4081",
			notice: { from: "pro", to: mwezi, notified_at: "2026-11-18T09:00:00Z", moves_at: "2026-12-17T21:30:00Z" },
		},
		next_amount: 65000,
		can_auto_renew: true,
		moving: true,
	},
}

function fetcherFor(
	subscription: unknown,
	checkout = vi.fn((_body: unknown) => Response.json({ checkout_url: "https://checkout.paystack.com/pilot" })),
) {
	return vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const path = new URL(String(input)).pathname
		if (path.endsWith("/account"))
			return Response.json({
				tier: "pro",
				status: "active",
				credits_remaining: 0,
				fast_remaining: 0,
				reason_remaining: 0,
				sparks: {
					version: "sparks-v1",
					unit: "nano_usd",
					grant_nusd: 1,
					used_nusd: 0,
					held_nusd: 0,
					purchased_nusd: 0,
					purchased_held_nusd: 0,
					period: "p",
					reset_at: "2026-12-01T00:00:00Z",
				},
			})
		if (path.endsWith("/products")) return Response.json({ billing_enabled: true, subscribable: ["mwezi"], data: [mwezi] })
		if (path.endsWith("/subscription")) return Response.json(subscription)
		if (path.endsWith("/checkout")) return checkout(JSON.parse(String(init?.body)))
		return Response.json({}, { status: 404 })
	}) as unknown as typeof fetch
}

describe("Mwezi subscriptions in Ola Code", () => {
	it("words a plan about to move, in East Africa Time, with a way out", async () => {
		const account = await fetchOpengatesAccount(auth, fetcherFor(moving))
		expect(account.subscription).toMatchObject({
			title: "Ola Pro becomes Mwezi on 18 Dec 2026",
			actionLabel: "Cancel instead",
			actionRenew: false,
			moving: true,
		})
		expect(account.subscription?.detail).toContain(
			"KES 650 every 30 days for 3,400,000 Sparks, charged to your card ending 4081",
		)
		expect(account.products[0].subscribable).toBe(true)
	})

	it("says nothing without a subscription, and words a renewing Mwezi", () => {
		expect(subscriptionStatus({ data: null })).toBeUndefined()
		const renewing = subscriptionStatus({
			data: {
				subscription: {
					product: mwezi,
					auto_renew: true,
					state: "active",
					period_end: "2027-01-16T21:30:00Z",
					next_charge_at: "2027-01-15T21:30:00Z",
				},
				can_auto_renew: true,
			},
		})
		expect(renewing).toMatchObject({
			title: "Mwezi renews every 30 days",
			detail: "Next: KES 650 on 16 Jan 2027, charged to your saved card.",
			actionLabel: "Cancel renewal",
		})
	})

	it("asks Ola to renew Mwezi monthly at checkout, and only for monthly bundles", async () => {
		const checkout = vi.fn((_body: unknown) => Response.json({ checkout_url: "https://checkout.paystack.com/pilot" }))
		await createOpengatesPlanCheckout(auth, "mwezi", fetcherFor(moving, checkout), true)
		expect(checkout).toHaveBeenCalledWith({ product_id: "mwezi", email: "pilot@example.com", subscribe: true })
		const siku = vi.fn(async (input: Parameters<typeof fetch>[0]) =>
			new URL(String(input)).pathname.endsWith("/products")
				? Response.json({ billing_enabled: true, subscribable: [], data: [{ ...mwezi, id: "siku" }] })
				: Response.json({}),
		) as unknown as typeof fetch
		await expect(createOpengatesPlanCheckout(auth, "siku", siku, true)).rejects.toThrow("cannot renew every month")
	})
})
