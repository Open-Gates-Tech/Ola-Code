import { beforeEach, describe, expect, it, vi } from "vitest"
import type { OpengatesAuthService } from "./opengates-auth-service"
import { prepareOpengatesAgentTask, resetOpengatesPolicyProbeCacheForTests } from "./opengates-task-budget"

const showMessage = vi.hoisted(() => vi.fn())

vi.mock("@/hosts/host-provider", () => ({
	HostProvider: { window: { showMessage } },
}))

const auth = {} as OpengatesAuthService
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

function taskResponse(premiumAuthorized = false, preset = "bugfix") {
	return {
		mode: "shadow",
		enforcement_enabled: false,
		customer_consumption: false,
		risk_dependency_missing: true,
		task: {
			id: "task-1",
			policy_version: "agent-budget-policy-v1",
			preset,
			cap_nusd: 150_000_000,
			shadow_used_nusd: 0,
			shadow_held_nusd: 0,
			iterations: 0,
			max_iterations: 10,
			premium_authorized: premiumAuthorized,
		},
	}
}

describe("OpenGates shadow task budget", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetOpengatesPolicyProbeCacheForTests()
	})

	it.each([
		undefined,
		{ version: "v1", mode: "off" },
	])("does not create task metadata or show consent UI when policy is %j", async (policy) => {
		const fetcher = vi.fn(async () =>
			json(policy ? { agent_budget_policy: policy } : { account: "legacy" }),
		) as unknown as typeof fetch

		await expect(prepareOpengatesAgentTask("task-1", auth, fetcher)).resolves.toEqual({ kind: "not_shadow" })
		expect(fetcher).toHaveBeenCalledTimes(1)
		expect(showMessage).not.toHaveBeenCalled()
	})

	it("lets the user choose a bounded preset and records only explicit Premium consent", async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = []
		const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
			const url = String(input)
			requests.push({ url, init })
			if (url.endsWith("/usage")) {
				return json({ agent_budget_policy: { version: "v1", mode: "shadow" } })
			}
			if (url.endsWith("/agent-tasks")) return json(taskResponse(false, "feature"))
			if (url.endsWith("/premium-consent")) return json(taskResponse(true))
			return json({}, 404)
		}) as unknown as typeof fetch
		showMessage.mockResolvedValueOnce({
			selectedOption: "Feature — up to $0.45 model-cost-equivalent evaluation cap (10 iterations)",
		})
		showMessage.mockResolvedValueOnce({ selectedOption: "Allow Premium evaluation" })

		const result = await prepareOpengatesAgentTask("task-1", auth, fetcher)

		expect(result).toMatchObject({ kind: "ready", task: { id: "task-1", premiumAuthorized: true } })
		const start = requests.find((request) => request.url.endsWith("/agent-tasks"))
		expect(start?.init?.method).toBe("POST")
		expect(JSON.parse(String(start?.init?.body))).toEqual({
			id: "task-1",
			preset: "feature",
			max_iterations: 10,
		})
		const consent = requests.find((request) => request.url.endsWith("/premium-consent"))
		expect(consent?.init?.method).toBe("POST")
		expect(JSON.parse(String(consent?.init?.body))).toMatchObject({
			confirmed: true,
			consent_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
		})
		expect(showMessage).toHaveBeenCalledTimes(2)
		expect(showMessage.mock.calls[0][0].options.items).toHaveLength(3)
		expect(showMessage.mock.calls[0][0].options.modal).toBe(true)
		expect(showMessage.mock.calls[1][0].options.detail).toContain("does not enable a Premium grant")
	})

	it("continues with a Standard-only shadow task when Premium consent is dismissed", async () => {
		const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input)
			if (url.endsWith("/usage")) return json({ agent_budget_policy: { mode: "shadow" } })
			return json(taskResponse())
		}) as unknown as typeof fetch
		showMessage.mockResolvedValueOnce({
			selectedOption: "Bugfix — up to $0.15 model-cost-equivalent evaluation cap (10 iterations)",
		})
		showMessage.mockResolvedValueOnce({})

		const result = await prepareOpengatesAgentTask("task-1", auth, fetcher)

		expect(result).toMatchObject({ kind: "ready", task: { premiumAuthorized: false } })
		expect(fetcher).toHaveBeenCalledTimes(2)
	})

	it("does not start a task when the preset dialog is dismissed", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(json({ agent_budget_policy: { mode: "shadow" } })) as unknown as typeof fetch
		showMessage.mockResolvedValueOnce({})

		await expect(prepareOpengatesAgentTask("task-1", auth, fetcher)).resolves.toEqual({ kind: "cancelled" })
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	it("falls back to existing behavior when usage status is unavailable", async () => {
		const fetcher = vi.fn(async () => json({}, 503)) as unknown as typeof fetch

		await expect(prepareOpengatesAgentTask("task-1", auth, fetcher)).resolves.toEqual({ kind: "not_shadow" })
		await expect(prepareOpengatesAgentTask("task-2", auth, fetcher)).resolves.toEqual({ kind: "not_shadow" })
		expect(showMessage).not.toHaveBeenCalled()
		expect(fetcher).toHaveBeenCalledTimes(1)
	})
})
