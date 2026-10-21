import { describe, expect, it, vi } from "vitest"
import { OpengatesAccount } from "@/shared/proto/cline/account"
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
					allowance_policy_version: 1,
					fast_limit: 750000,
					reason_limit: 0,
					reset_at: "2026-11-01T00:00:00Z",
					expires_at: "0001-01-01T00:00:00Z",
				}),
			"/billing/products": () => json(catalog),
		})
		const account = await fetchOpengatesAccount(auth, fetcher)
		expect(account).toMatchObject({
			tier: "free",
			fastRemaining: 250000,
			allowancePolicyVersion: 1,
			fastLimit: 750000,
			reasonLimit: 0,
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
		expect(pro.fastLimit).toBeUndefined()
		expect(pro.reasonLimit).toBeUndefined()
		expect(pro.allowancePolicyVersion).toBeUndefined()
		expect(products).not.toHaveBeenCalled()
	})

	it.each(["free", "pro", "ultra", "internal", "custom"])("does not guess missing limits for %s", async (tier) => {
		const account = await fetchOpengatesAccount(
			auth,
			fakeFetch({
				"/account": () =>
					json({ tier, status: "active", credits_remaining: 100, fast_remaining: 123, reason_remaining: 45 }),
			}),
		)
		const decoded = OpengatesAccount.decode(OpengatesAccount.encode(account).finish())
		const fromJson = OpengatesAccount.fromJSON(OpengatesAccount.toJSON(account))
		for (const result of [account, decoded, fromJson]) {
			expect(result.fastLimit).toBeUndefined()
			expect(result.reasonLimit).toBeUndefined()
			expect(result.allowancePolicyVersion).toBeUndefined()
			expect(result).toMatchObject({ fastRemaining: 123, reasonRemaining: 45 })
		}
	})

	it.each([
		{ fast_limit: -1, reason_limit: 0 },
		{ fast_limit: 9_000_000_000, reason_limit: 123456 },
		{ fast_limit: 0, reason_limit: undefined },
	])("preserves server limits and optional presence through protobuf: %j", async (limits) => {
		const account = await fetchOpengatesAccount(
			auth,
			fakeFetch({
				"/account": () =>
					json({
						tier: "custom",
						status: "active",
						credits_remaining: 0,
						fast_remaining: 123,
						reason_remaining: 45,
						allowance_policy_version: 2,
						...limits,
					}),
			}),
		)
		const decoded = OpengatesAccount.decode(OpengatesAccount.encode(account).finish())
		const fromJson = OpengatesAccount.fromJSON(OpengatesAccount.toJSON(account))
		for (const result of [account, decoded, fromJson]) {
			expect(result.fastLimit).toBe(limits.fast_limit)
			expect(result.reasonLimit).toBe(limits.reason_limit)
			expect(result.allowancePolicyVersion).toBe(2)
		}
	})

	it("loads the last task's server-authoritative shadow evaluation snapshot", async () => {
		const fetcher = fakeFetch({
			"/account": () =>
				json({ tier: "pro", status: "active", credits_remaining: 0, fast_remaining: 10, reason_remaining: 5 }),
			"/agent-tasks/task-1": () =>
				json({
					mode: "shadow",
					enforcement_enabled: false,
					customer_consumption: false,
					risk_dependency_missing: true,
					task: {
						id: "task-1",
						policy_version: "agent-budget-policy-v1",
						preset: "feature",
						cap_nusd: 450_000_000,
						shadow_used_nusd: 25_000_000,
						shadow_held_nusd: 5_000_000,
						iterations: 2,
						max_iterations: 10,
						premium_authorized: false,
						standard: {
							grant_nusd: 2_500_000_000,
							used_nusd: 50_000_000,
							held_nusd: 5_000_000,
							available_nusd: 2_445_000_000,
						},
						premium: {
							grant_nusd: 1_000_000_000,
							used_nusd: 0,
							held_nusd: 0,
							available_nusd: 1_000_000_000,
						},
					},
				}),
		})

		const account = await fetchOpengatesAccount(auth, fetcher, "task-1")
		const roundTripped = OpengatesAccount.decode(OpengatesAccount.encode(account).finish())
		expect(roundTripped.agentBudgetTask).toMatchObject({
			mode: "shadow",
			enforcementEnabled: false,
			customerConsumption: false,
			riskDependencyMissing: true,
			id: "task-1",
			preset: "feature",
			capNusd: 450_000_000,
			shadowUsedNusd: 25_000_000,
			shadowHeldNusd: 5_000_000,
			standard: { availableNusd: 2_445_000_000, heldNusd: 5_000_000 },
			premium: { availableNusd: 1_000_000_000, heldNusd: 0 },
		})
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
