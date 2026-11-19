import { describe, expect, it, vi } from "vitest"
import { LEGACY_WORKSPACE_KEY, OLA_WORKSPACE_KEY, OlaWorkspaceChoice, parseWorkspaces } from "./ola-workspace"
import { fetchWorkspace, toTeamSparks } from "./opengates-team"

const org = { id: "0123456789abcdef01234567", name: "Sir Africa", slug: "sirafrica", role: "member" as const }
const memento = (initial: Record<string, unknown> = {}) => {
	const state = new Map<string, unknown>(Object.entries(initial))
	return { state, get: (k: string) => state.get(k), update: async (k: string, v: unknown) => void state.set(k, v) }
}

describe("the Ola workspace choice", () => {
	it("keeps only well-formed organisations from Ola's list", () => {
		const list = parseWorkspaces({
			items: [
				org,
				{ ...org },
				{ id: "../x", name: "Bad" },
				{ id: "89abcdef0123456789abcdef", name: "Owner Co", role: "owner" },
			],
		})
		expect(list.map((w) => w.name)).toEqual(["Sir Africa", "Owner Co"])
		expect(() => parseWorkspaces({})).toThrow()
	})

	it("reads the skill sync's earlier choice, and moves it on the next change", async () => {
		const m = memento({ [LEGACY_WORKSPACE_KEY]: { id: org.id, name: org.name } })
		const choice = new OlaWorkspaceChoice(m)
		expect(choice.current()?.name).toBe("Sir Africa")
		const seen = vi.fn()
		choice.onChange(seen)
		await choice.set(undefined)
		expect(choice.current()).toBeUndefined()
		expect(m.state.get(LEGACY_WORKSPACE_KEY)).toBeUndefined()
		expect(m.state.get(OLA_WORKSPACE_KEY)).toBeUndefined()
		expect(seen).toHaveBeenCalledWith(undefined)
	})
})

describe("team Sparks in Ola Code", () => {
	const mine = {
		enabled: true,
		limit_sparks: 50000,
		extra_sparks: 10000,
		used_sparks: 12000,
		remaining_sparks: 48000,
		own_sparks: false,
		pending_request_sparks: 20000,
	}

	it("reads what the organisation gives the member, with no limit as unlimited", () => {
		expect(toTeamSparks({ data: mine })).toMatchObject({
			enabled: true,
			limited: true,
			limit: 50000,
			extra: 10000,
			remaining: 48000,
			pending: 20000,
		})
		expect(toTeamSparks({ data: { ...mine, limit_sparks: null, remaining_sparks: null } })).toMatchObject({ limited: false })
	})

	it("asks for the member's view in the organisation's workspace, and not for the owner", async () => {
		const fetcher = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ data: mine })))
		const member = await fetchWorkspace(fetcher, "https://api.test/v1", org)
		expect(member.sparksUrl).toBe("https://ola.opengates.app/s/sirafrica/sparks")
		expect(member.team?.used).toBe(12000)
		const init = fetcher.mock.calls[0][1] as RequestInit
		expect(new Headers(init.headers).get("X-Ola-Workspace")).toBe(org.id)

		const owner = await fetchWorkspace(fetcher, "https://api.test/v1", { ...org, role: "owner" })
		expect(owner.team).toBeUndefined()
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	it("still shows the workspace when Biashara can't be read", async () => {
		const fetcher = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}", { status: 503 }))
		const ws = await fetchWorkspace(fetcher, "https://api.test/v1", org)
		expect(ws.name).toBe("Sir Africa")
		expect(ws.team).toBeUndefined()
	})
})
