import { z } from "zod"
import {
	OpengatesAccount,
	OpengatesAgentBudgetBalance,
	OpengatesAgentBudgetTask,
	OpengatesBundleOffer,
	OpengatesProduct,
	OpengatesSparksBundle,
	OpengatesSparksCall,
	OpengatesSparksWallet,
	OpengatesSubscriptionStatus,
} from "@/shared/proto/cline/account"
import { Logger } from "@/shared/services/Logger"
import type { OpengatesAuthService } from "./opengates-auth-service"
import { createOpengatesFetch, OPENGATES_API_BASE_URL } from "./opengates-provider"
import { subscriptionSchema, subscriptionStatus } from "./opengates-subscription"
import { getOpengatesAgentTask } from "./opengates-task-budget"

const exactAmount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const hour = z.number().int().min(0).max(23)
const bundleSchema = z
	.object({
		id: z.string().min(1),
		product: z.string(),
		granted_nusd: exactAmount,
		used_nusd: exactAmount,
		held_nusd: exactAmount,
		starts_at: z.string().datetime({ offset: true }),
		expires_at: z.string().datetime({ offset: true }),
		windowed: z.boolean().optional(),
		from_hour: hour.optional(),
		to_hour: hour.optional(),
	})
	.refine((b) => b.used_nusd + b.held_nusd <= b.granted_nusd, "Invalid Sparks bundle balance")
const sparksSchema = z
	.object({
		version: z.literal("sparks-v1"),
		unit: z.literal("nano_usd"),
		grant_nusd: exactAmount,
		used_nusd: exactAmount,
		held_nusd: exactAmount,
		purchased_nusd: exactAmount,
		purchased_held_nusd: exactAmount,
		period: z.string().min(1),
		reset_at: z.string().datetime({ offset: true }),
		bundles: z.array(bundleSchema).max(24).optional(),
		daily: z.boolean().optional(),
	})
	.refine(
		(w) =>
			w.used_nusd <= w.grant_nusd && w.held_nusd <= w.grant_nusd - w.used_nusd && w.purchased_held_nusd <= w.purchased_nusd,
		"Invalid Sparks balance conservation",
	)
const callSchema = z.object({
	id: z.string().min(1),
	parent: z.string().optional(),
	model: z.string(),
	role: z.string(),
	state: z.enum(["pending", "settled", "uncharged_unknown", "interrupted"]),
	outcome: z.string(),
	debit_nusd: exactAmount,
	held_nusd: exactAmount,
	prompt_tokens: exactAmount,
	cached_tokens: exactAmount,
	cache_write_tokens: exactAmount,
	completion_tokens: exactAmount,
	timestamp: z.string().datetime({ offset: true }),
})
const accountSchema = z.object({
	tier: z.string(),
	status: z.string(),
	credits_remaining: z.number(),
	fast_remaining: z.number(),
	reason_remaining: z.number(),
	allowance_policy_version: z.number().int().nonnegative().optional(),
	fast_limit: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER).optional(),
	reason_limit: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER).optional(),
	reset_at: z.string().optional(),
	expires_at: z.string().optional(),
	sparks: sparksSchema.optional(),
	sparks_calls: z.array(callSchema).max(20).optional(),
})
const productSchema = z.object({
	id: z.string().min(1),
	currency: z.string(),
	amount: z.number(),
	tier: z.string().optional(),
	days: z.number().optional(),
	billing_version: z.string().optional(),
	bundle: z
		.object({
			name: z.string().min(1).max(40),
			label: z.string().max(60),
			sparks: z.number().int().positive(),
			hours: z.number().int().nonnegative().optional(),
			until_midnight: z.boolean().optional(),
			windowed: z.boolean().optional(),
			from_hour: hour.optional(),
			to_hour: hour.optional(),
			sell_until_hour: hour.optional(),
			top_up: z.boolean().optional(),
		})
		.optional(),
})
const catalogSchema = z.object({
	data: z.array(productSchema),
	billing_enabled: z.boolean().optional(),
	not_on_sale: z.array(z.string()).optional(),
	subscribable: z.array(z.string()).optional(),
})
type CatalogProduct = z.infer<typeof productSchema>

/** A Sparks plan (USD, with a tier) or a Sparks bundle or top-up (KES, with an offer). */
function sparksProduct(p: CatalogProduct): boolean {
	if (p.billing_version !== "sparks-v1") return false
	return p.bundle ? p.currency === "KES" && !p.tier : p.currency === "USD"
}

function toProduct(p: CatalogProduct, closed: string[], renewing: string[] = []): OpengatesProduct {
	const b = p.bundle
	return OpengatesProduct.create({
		id: p.id,
		currency: p.currency,
		amount: p.amount,
		tier: p.tier,
		billingVersion: p.billing_version,
		onSale: !closed.includes(p.id),
		subscribable: renewing.includes(p.id),
		bundle: b
			? OpengatesBundleOffer.create({
					name: b.name,
					label: b.label,
					sparks: b.sparks,
					hours: b.hours ?? 0,
					untilMidnight: b.until_midnight ?? false,
					windowed: b.windowed ?? false,
					fromHour: b.from_hour ?? 0,
					toHour: b.to_hour ?? 0,
					sellUntilHour: b.sell_until_hour ?? 0,
					topUp: b.top_up ?? false,
				})
			: undefined,
	})
}
const checkoutSchema = z.object({ checkout_url: z.string().url() })

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
	lastAgentTaskId?: string,
): Promise<OpengatesAccount> {
	const account = await getJson(fetcher, "/account", accountSchema)
	const agentTask = lastAgentTaskId && !account.sparks ? await getOpengatesAgentTask(lastAgentTaskId, auth, fetcher) : undefined
	let products: OpengatesProduct[] = []
	let billingEnabled = false
	if (account.sparks) {
		try {
			const catalog = await getJson(fetcher, "/billing/products", catalogSchema)
			billingEnabled = catalog.billing_enabled === true
			products = catalog.data
				.filter(sparksProduct)
				.map((p) => toProduct(p, catalog.not_on_sale ?? [], catalog.subscribable ?? []))
		} catch (error) {
			Logger.warn("Could not load Sparks plan catalog; checkout is unavailable.", error)
		}
	}
	let subscription: OpengatesSubscriptionStatus | undefined
	if (account.sparks) {
		try {
			subscription = subscriptionStatus(await getJson(fetcher, "/billing/subscription", subscriptionSchema))
		} catch (error) {
			Logger.warn("Could not load the Sparks subscription.", error)
		}
	}
	let upgradeProduct: OpengatesProduct | undefined
	if (account.tier === "free" && !account.sparks) {
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
		sparks: account.sparks
			? OpengatesSparksWallet.create({
					version: account.sparks.version,
					unit: account.sparks.unit,
					grantNusd: account.sparks.grant_nusd,
					usedNusd: account.sparks.used_nusd,
					heldNusd: account.sparks.held_nusd,
					purchasedNusd: account.sparks.purchased_nusd,
					purchasedHeldNusd: account.sparks.purchased_held_nusd,
					period: account.sparks.period,
					resetAt: account.sparks.reset_at,
					daily: account.sparks.daily ?? false,
					bundles: (account.sparks.bundles ?? []).map((b) =>
						OpengatesSparksBundle.create({
							id: b.id,
							product: b.product,
							grantedNusd: b.granted_nusd,
							usedNusd: b.used_nusd,
							heldNusd: b.held_nusd,
							startsAt: b.starts_at,
							expiresAt: b.expires_at,
							windowed: b.windowed ?? false,
							fromHour: b.from_hour ?? 0,
							toHour: b.to_hour ?? 0,
						}),
					),
				})
			: undefined,
		sparksCalls:
			account.sparks_calls?.map((c) =>
				OpengatesSparksCall.create({
					id: c.id,
					parent: c.parent,
					model: c.model,
					role: c.role,
					state: c.state,
					outcome: c.outcome,
					debitNusd: c.debit_nusd,
					heldNusd: c.held_nusd,
					promptTokens: c.prompt_tokens,
					cachedTokens: c.cached_tokens,
					cacheWriteTokens: c.cache_write_tokens,
					completionTokens: c.completion_tokens,
					timestamp: c.timestamp,
				}),
			) ?? [],
		products,
		billingEnabled,
		subscription,
		tier: account.tier,
		status: account.status,
		creditsRemaining: account.credits_remaining,
		fastRemaining: account.fast_remaining,
		reasonRemaining: account.reason_remaining,
		allowancePolicyVersion: account.allowance_policy_version,
		fastLimit: account.fast_limit,
		reasonLimit: account.reason_limit,
		resetAt: optionalDate(account.reset_at),
		expiresAt: optionalDate(account.expires_at),
		agentBudgetTask: agentTask
			? OpengatesAgentBudgetTask.create({
					mode: agentTask.mode,
					enforcementEnabled: agentTask.enforcementEnabled,
					customerConsumption: agentTask.customerConsumption,
					riskDependencyMissing: agentTask.riskDependencyMissing,
					id: agentTask.id,
					policyVersion: agentTask.policyVersion,
					period: agentTask.period,
					plan: agentTask.plan,
					preset: agentTask.preset,
					capNusd: agentTask.capNusd,
					shadowUsedNusd: agentTask.shadowUsedNusd,
					shadowHeldNusd: agentTask.shadowHeldNusd,
					iterations: agentTask.iterations,
					maxIterations: agentTask.maxIterations,
					deadline: optionalDate(agentTask.deadline),
					reviewRequired: agentTask.reviewRequired,
					premiumAuthorized: agentTask.premiumAuthorized,
					standard: agentTask.standard ? OpengatesAgentBudgetBalance.create(agentTask.standard) : undefined,
					premium: agentTask.premium ? OpengatesAgentBudgetBalance.create(agentTask.premium) : undefined,
				})
			: undefined,
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

export async function createOpengatesPlanCheckout(
	auth: OpengatesAuthService,
	productId: string,
	fetcher: typeof globalThis.fetch = createOpengatesFetch(auth),
	subscribe = false,
): Promise<string> {
	const email = (await auth.getUser())?.email
	if (!email) throw new Error("Your Opengates account has no email address for checkout.")
	const catalog = await getJson(fetcher, "/billing/products", catalogSchema)
	const product = catalog.data.find((p) => p.id === productId && sparksProduct(p))
	if (!catalog.billing_enabled || !product) throw new Error("This Sparks plan or bundle is not available for checkout.")
	if (catalog.not_on_sale?.includes(product.id))
		throw new Error(`${product.bundle?.name ?? "This bundle"} is not sold at this hour.`)
	if (subscribe && !catalog.subscribable?.includes(product.id))
		throw new Error(`${product.bundle?.name ?? "This bundle"} cannot renew every month.`)
	const checkout = await getJson(fetcher, "/billing/checkout", checkoutSchema, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(subscribe ? { product_id: product.id, email, subscribe: true } : { product_id: product.id, email }),
	})
	if (new URL(checkout.checkout_url).protocol !== "https:") throw new Error("Opengates returned an insecure checkout URL.")
	return checkout.checkout_url
}

/** Cancels (false) or restarts (true) automatic renewal. Cancelling keeps what is already paid for. */
export async function setOpengatesAutoRenew(
	auth: OpengatesAuthService,
	renew: boolean,
	fetcher: typeof globalThis.fetch = createOpengatesFetch(auth),
): Promise<void> {
	// The change is made once Ola answers; the account view reloads the subscription itself.
	await getJson(fetcher, `/billing/subscription/${renew ? "resume" : "cancel"}`, z.unknown(), { method: "POST" })
}
