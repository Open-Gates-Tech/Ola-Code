import { z } from "zod"
import { OpengatesAccount, OpengatesProduct } from "@/shared/proto/cline/account"
import type { OpengatesAuthService } from "./opengates-auth-service"
import { createOpengatesFetch, OPENGATES_API_BASE_URL } from "./opengates-provider"

const accountSchema = z.object({
	tier: z.string(),
	status: z.string(),
	credits_remaining: z.number(),
	fast_remaining: z.number(),
	reason_remaining: z.number(),
	reset_at: z.string().optional(),
	expires_at: z.string().optional(),
})
const productSchema = z.object({
	id: z.string().min(1),
	currency: z.string(),
	amount: z.number(),
	tier: z.string().optional(),
	days: z.number().optional(),
})
const catalogSchema = z.object({ data: z.array(productSchema), billing_enabled: z.boolean().optional() })
const checkoutSchema = z.object({ checkout_url: z.string().url() })

// Mirrors Allowances() in OlaAI-Server models/account; -1 means unlimited.
export function opengatesAllowances(tier: string): { fast: number; reason: number } {
	switch (tier) {
		case "pro":
			return { fast: 10_000_000, reason: 1_500_000 }
		case "internal":
			return { fast: -1, reason: 5_000_000 }
		default:
			return { fast: 500_000, reason: 0 }
	}
}

// Go serializes unset time.Time as year 0001.
function optionalDate(value: string | undefined): string | undefined {
	if (!value) return undefined
	const date = new Date(value)
	return Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000 ? undefined : date.toISOString()
}

async function getJson<T>(fetcher: typeof globalThis.fetch, path: string, schema: z.ZodType<T>, init?: RequestInit) {
	const response = await fetcher(`${OPENGATES_API_BASE_URL}${path}`, init)
	if (!response.ok) {
		await response.body?.cancel()
		throw new Error(`Opengates request ${path} failed with status ${response.status}.`)
	}
	return schema.parse(await response.json())
}

async function findUpgradeProduct(fetcher: typeof globalThis.fetch) {
	const catalog = await getJson(fetcher, "/billing/products", catalogSchema)
	if (catalog.billing_enabled === false) return undefined
	return catalog.data.find((product) => product.tier === "pro" && (product.days ?? 0) > 0)
}

export async function fetchOpengatesAccount(
	auth: OpengatesAuthService,
	fetcher: typeof globalThis.fetch = createOpengatesFetch(auth),
): Promise<OpengatesAccount> {
	const account = await getJson(fetcher, "/account", accountSchema)
	const allowances = opengatesAllowances(account.tier)
	let upgradeProduct: OpengatesProduct | undefined
	if (account.tier === "free") {
		// The plan details still render if the catalog is unavailable; only the upgrade offer is hidden.
		const product = await findUpgradeProduct(fetcher).catch(() => undefined)
		if (product) {
			upgradeProduct = OpengatesProduct.create({
				id: product.id,
				currency: product.currency,
				amount: product.amount,
				days: product.days ?? 0,
			})
		}
	}
	return OpengatesAccount.create({
		tier: account.tier,
		status: account.status,
		creditsRemaining: account.credits_remaining,
		fastRemaining: account.fast_remaining,
		reasonRemaining: account.reason_remaining,
		fastAllowance: allowances.fast,
		reasonAllowance: allowances.reason,
		resetAt: optionalDate(account.reset_at),
		expiresAt: optionalDate(account.expires_at),
		upgradeProduct,
	})
}

export async function createOpengatesUpgradeCheckout(
	auth: OpengatesAuthService,
	fetcher: typeof globalThis.fetch = createOpengatesFetch(auth),
): Promise<string> {
	const email = (await auth.getUser())?.email
	if (!email) {
		throw new Error("Your Opengates account has no email address for checkout.")
	}
	const product = await findUpgradeProduct(fetcher)
	if (!product) {
		throw new Error("Ola Pro is not available for purchase right now.")
	}
	const checkout = await getJson(fetcher, "/billing/checkout", checkoutSchema, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ product_id: product.id, email }),
	})
	if (new URL(checkout.checkout_url).protocol !== "https:") {
		throw new Error("Opengates returned an insecure checkout URL.")
	}
	return checkout.checkout_url
}
