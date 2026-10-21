import { randomUUID } from "node:crypto"
import { z } from "zod"
import { HostProvider } from "@/hosts/host-provider"
import { ShowMessageRequest, ShowMessageType } from "@/shared/proto/host/window"
import { Logger } from "@/shared/services/Logger"
import { OpengatesAuthService } from "./opengates-auth-service"
import { createOpengatesFetch, OPENGATES_API_BASE_URL } from "./opengates-provider"

const policySchema = z.object({
	agent_budget_policy: z
		.object({
			version: z.string().optional(),
			mode: z.string(),
		})
		.passthrough()
		.optional(),
})

const balanceSchema = z
	.object({
		grant_nusd: z.number().int().nonnegative().optional(),
		used_nusd: z.number().int().nonnegative().optional(),
		held_nusd: z.number().int().nonnegative().optional(),
		available_nusd: z.number().int().nonnegative().optional(),
		remaining_nusd: z.number().int().nonnegative().optional(),
	})
	.passthrough()

const taskSchema = z
	.object({
		id: z.string(),
		policy_version: z.string().optional(),
		period: z.string().optional(),
		plan: z.string().optional(),
		preset: z.string().optional(),
		cap_nusd: z.number().int().nonnegative().optional(),
		shadow_used_nusd: z.number().int().nonnegative().optional(),
		shadow_held_nusd: z.number().int().nonnegative().optional(),
		iterations: z.number().int().nonnegative().optional(),
		max_iterations: z.number().int().positive().optional(),
		deadline: z.string().optional(),
		review_required: z.boolean().optional(),
		premium_authorized: z.boolean().optional(),
		standard: balanceSchema.optional(),
		premium: balanceSchema.optional(),
		standard_balance: balanceSchema.optional(),
		premium_balance: balanceSchema.optional(),
		standard_remaining_nusd: z.number().int().nonnegative().optional(),
		standard_available_nusd: z.number().int().nonnegative().optional(),
		standard_held_nusd: z.number().int().nonnegative().optional(),
		premium_remaining_nusd: z.number().int().nonnegative().optional(),
		premium_available_nusd: z.number().int().nonnegative().optional(),
		premium_held_nusd: z.number().int().nonnegative().optional(),
		risk_dependency_missing: z.boolean().optional(),
	})
	.passthrough()

const taskResponseSchema = z
	.object({
		mode: z.string().optional(),
		enforcement_enabled: z.boolean().optional(),
		customer_consumption: z.boolean().optional(),
		risk_dependency_missing: z.boolean().optional(),
		task: taskSchema,
		standard_balance: balanceSchema.optional(),
		premium_balance: balanceSchema.optional(),
		standard_remaining_nusd: z.number().int().nonnegative().optional(),
		standard_available_nusd: z.number().int().nonnegative().optional(),
		standard_held_nusd: z.number().int().nonnegative().optional(),
		premium_remaining_nusd: z.number().int().nonnegative().optional(),
		premium_available_nusd: z.number().int().nonnegative().optional(),
		premium_held_nusd: z.number().int().nonnegative().optional(),
	})
	.passthrough()

type PolicyProbeCache = { mode?: string; retryAt: number; failures: number }
let policyProbeCache = new WeakMap<OpengatesAuthService, PolicyProbeCache>()

const POLICY_CACHE_MS = 15_000
const POLICY_FAILURE_BACKOFF_MS = 30_000
const POLICY_FAILURE_BACKOFF_MAX_MS = 5 * 60_000

export type OpengatesAgentBudgetBalance = {
	grantNusd?: number
	usedNusd?: number
	heldNusd?: number
	availableNusd?: number
}

export type OpengatesAgentBudgetTask = {
	mode: string
	enforcementEnabled?: boolean
	customerConsumption?: boolean
	riskDependencyMissing?: boolean
	id: string
	policyVersion?: string
	period?: string
	plan?: string
	preset?: string
	capNusd?: number
	shadowUsedNusd?: number
	shadowHeldNusd?: number
	iterations?: number
	maxIterations?: number
	deadline?: string
	reviewRequired?: boolean
	premiumAuthorized?: boolean
	standard?: OpengatesAgentBudgetBalance
	premium?: OpengatesAgentBudgetBalance
}

export interface OpengatesTaskCorrelation {
	taskId: string
	enabled: boolean
}

export function createOpengatesTaskCorrelation(taskId: string): OpengatesTaskCorrelation {
	return { taskId, enabled: false }
}

async function getJson<T>(fetcher: typeof globalThis.fetch, path: string, schema: z.ZodType<T>, init?: RequestInit) {
	const response = await fetcher(`${OPENGATES_API_BASE_URL}${path}`, init)
	if (!response.ok) {
		await response.body?.cancel()
		throw new Error(`Opengates request ${path} failed with status ${response.status}.`)
	}
	return schema.parse(await response.json())
}

async function readBudgetPolicyMode(auth: OpengatesAuthService, fetcher: typeof globalThis.fetch): Promise<string | undefined> {
	const now = Date.now()
	const cached = policyProbeCache.get(auth)
	if (cached && cached.retryAt > now) return cached.mode

	try {
		const policy = await getJson(fetcher, "/usage", policySchema)
		const mode = policy.agent_budget_policy?.mode
		policyProbeCache.set(auth, { mode, retryAt: now + (mode === "shadow" ? 0 : POLICY_CACHE_MS), failures: 0 })
		return mode
	} catch (error) {
		const failures = (cached?.failures ?? 0) + 1
		const backoff = Math.min(POLICY_FAILURE_BACKOFF_MS * 2 ** (failures - 1), POLICY_FAILURE_BACKOFF_MAX_MS)
		policyProbeCache.set(auth, { retryAt: now + backoff, failures })
		Logger.warn("[OpengatesBudget] Could not read budget policy; continuing without task metadata.", error)
		return undefined
	}
}

function asBalance(
	value: z.infer<typeof balanceSchema> | undefined,
	remaining?: number,
	held?: number,
): OpengatesAgentBudgetBalance | undefined {
	if (!value && remaining === undefined && held === undefined) return undefined
	return {
		grantNusd: value?.grant_nusd,
		usedNusd: value?.used_nusd,
		heldNusd: value?.held_nusd ?? held,
		availableNusd: value?.available_nusd ?? value?.remaining_nusd ?? remaining,
	}
}

export function parseOpengatesAgentBudgetTask(value: unknown): OpengatesAgentBudgetTask {
	const response = taskResponseSchema.parse(value)
	const task = response.task
	return {
		mode: response.mode ?? "shadow",
		enforcementEnabled: response.enforcement_enabled,
		customerConsumption: response.customer_consumption,
		riskDependencyMissing: response.risk_dependency_missing ?? task.risk_dependency_missing,
		id: task.id,
		policyVersion: task.policy_version,
		period: task.period,
		plan: task.plan,
		preset: task.preset,
		capNusd: task.cap_nusd,
		shadowUsedNusd: task.shadow_used_nusd,
		shadowHeldNusd: task.shadow_held_nusd,
		iterations: task.iterations,
		maxIterations: task.max_iterations,
		deadline: task.deadline,
		reviewRequired: task.review_required,
		premiumAuthorized: task.premium_authorized,
		standard: asBalance(
			task.standard_balance ?? task.standard ?? response.standard_balance,
			task.standard_available_nusd ??
				task.standard_remaining_nusd ??
				response.standard_available_nusd ??
				response.standard_remaining_nusd,
			task.standard_held_nusd ?? response.standard_held_nusd,
		),
		premium: asBalance(
			task.premium_balance ?? task.premium ?? response.premium_balance,
			task.premium_available_nusd ??
				task.premium_remaining_nusd ??
				response.premium_available_nusd ??
				response.premium_remaining_nusd,
			task.premium_held_nusd ?? response.premium_held_nusd,
		),
	}
}

const PRESETS = [
	{ id: "bugfix", label: "Bugfix — up to $0.15 model-cost-equivalent evaluation cap (10 iterations)" },
	{ id: "feature", label: "Feature — up to $0.45 model-cost-equivalent evaluation cap (10 iterations)" },
	{ id: "research", label: "Research — up to $0.25 model-cost-equivalent evaluation cap (10 iterations)" },
] as const

export type OpengatesTaskPreparation =
	| { kind: "not_shadow" }
	| { kind: "cancelled" }
	| { kind: "ready"; task: OpengatesAgentBudgetTask }

export async function prepareOpengatesAgentTask(
	taskId: string,
	auth = OpengatesAuthService.get(),
	fetcher?: typeof globalThis.fetch,
): Promise<OpengatesTaskPreparation> {
	if (!auth) return { kind: "not_shadow" }
	const authenticatedFetch = fetcher ?? createOpengatesFetch(auth)
	if ((await readBudgetPolicyMode(auth, authenticatedFetch)) !== "shadow") return { kind: "not_shadow" }

	const selected = await HostProvider.window.showMessage(
		ShowMessageRequest.create({
			type: ShowMessageType.INFORMATION,
			message: "Choose a shadow-evaluation budget preset for this task",
			options: {
				modal: true,
				detail: "These are visible evaluation-only model-cost-equivalent caps, not active grants or customer charges. The server remains authoritative for the actual task cap. Each preset allows up to 10 iterations.",
				items: PRESETS.map((preset) => preset.label),
			},
		}),
	)
	const selectedPreset = PRESETS.find((preset) => preset.label === selected.selectedOption)
	if (!selectedPreset) return { kind: "cancelled" }

	const startResponse = await getJson(authenticatedFetch, "/agent-tasks", taskResponseSchema, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id: taskId, preset: selectedPreset.id, max_iterations: 10 }),
	})
	let task = parseOpengatesAgentBudgetTask(startResponse)

	const consent = await HostProvider.window.showMessage(
		ShowMessageRequest.create({
			type: ShowMessageType.WARNING,
			message: "Allow Premium evaluation for this task?",
			options: {
				modal: true,
				detail: "This records explicit, task-scoped evaluation consent only. It does not enable a Premium grant, change your selected model, consume customer usage, or authorize automatic model switching.",
				items: ["Allow Premium evaluation", "Standard only"],
			},
		}),
	)
	if (consent.selectedOption === "Allow Premium evaluation") {
		const consentResponse = await getJson(
			authenticatedFetch,
			`/agent-tasks/${encodeURIComponent(taskId)}/premium-consent`,
			taskResponseSchema,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ confirmed: true, consent_id: randomUUID() }),
			},
		)
		task = parseOpengatesAgentBudgetTask(consentResponse)
	}

	return { kind: "ready", task }
}

export async function getOpengatesAgentTask(
	taskId: string,
	auth = OpengatesAuthService.get(),
	fetcher?: typeof globalThis.fetch,
): Promise<OpengatesAgentBudgetTask | undefined> {
	if (!auth) return undefined
	try {
		const response = await getJson(
			fetcher ?? createOpengatesFetch(auth),
			`/agent-tasks/${encodeURIComponent(taskId)}`,
			taskResponseSchema,
		)
		return parseOpengatesAgentBudgetTask(response)
	} catch (error) {
		Logger.warn("[OpengatesBudget] Could not refresh shadow task status.", error)
		return undefined
	}
}

export async function resumeOpengatesAgentTask(
	taskId: string,
	auth = OpengatesAuthService.get(),
	fetcher?: typeof globalThis.fetch,
): Promise<OpengatesAgentBudgetTask | undefined> {
	if (!auth) return undefined
	const authenticatedFetch = fetcher ?? createOpengatesFetch(auth)
	try {
		if ((await readBudgetPolicyMode(auth, authenticatedFetch)) !== "shadow") return undefined
		return await getOpengatesAgentTask(taskId, auth, authenticatedFetch)
	} catch (error) {
		Logger.warn("[OpengatesBudget] Could not verify shadow policy for task resume.", error)
		return undefined
	}
}

export function resetOpengatesPolicyProbeCacheForTests(): void {
	policyProbeCache = new WeakMap<OpengatesAuthService, PolicyProbeCache>()
}

export function formatOpengatesTaskBudget(task: OpengatesAgentBudgetTask): string {
	const dollars = (value: number | undefined) =>
		value === undefined ? "unavailable" : `$${(value / 1_000_000_000).toFixed(3)}`
	const lines = [
		"**Shadow evaluation only** — these are not active grants. The server does not enforce these caps or consume customer usage.",
		`Task preset: ${task.preset ?? "unknown"}; server-reported evaluation cap: ${dollars(task.capNusd)} model-cost-equivalent.`,
		`Task shadow usage: ${dollars(task.shadowUsedNusd)} used; ${dollars(task.shadowHeldNusd)} held.`,
		`Iterations: ${task.iterations ?? 0}/${task.maxIterations ?? "unknown"}; Premium evaluation consent: ${task.premiumAuthorized ? "granted for this task" : "not granted"}.`,
	]
	if (task.standard || task.premium) {
		for (const [label, balance] of [
			["Standard", task.standard],
			["Premium", task.premium],
		] as const) {
			lines.push(
				`${label} shadow balance: ${dollars(balance?.availableNusd)} remaining; ${dollars(balance?.heldNusd)} held.`,
			)
		}
	} else {
		lines.push("Standard/Premium remaining and held totals are unavailable from the server response.")
	}
	if (task.riskDependencyMissing) {
		lines.push("Provider-risk dependency is missing; no independent risk cap is enforced.")
	}
	return lines.join("\n\n")
}

export function isOpengatesProviderConfig(providerId: string, baseUrl: string | undefined): boolean {
	if (providerId !== "openai-compatible" || !baseUrl) return false
	try {
		const candidate = new URL(baseUrl)
		const gateway = new URL(OPENGATES_API_BASE_URL)
		return candidate.origin === gateway.origin && candidate.pathname.replace(/\/+$/, "") === gateway.pathname
	} catch {
		return false
	}
}
