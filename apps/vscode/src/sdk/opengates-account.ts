import { z } from "zod"
import {
	OpengatesAccount,
	OpengatesAgentBudgetBalance,
	OpengatesAgentBudgetTask,
	OpengatesProduct,
} from "@/shared/proto/cline/account"
import type { OpengatesAuthService } from "./opengates-auth-service"
import { createOpengatesFetch, OPENGATES_API_BASE_URL } from "./opengates-provider"
import { getOpengatesAgentTask } from "./opengates-task-budget"

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
	const agentTask = lastAgentTaskId ? await getOpengatesAgentTask(lastAgentTaskId, auth, fetcher) : undefined
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
