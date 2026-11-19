import { z } from "zod"
import { OpengatesTeamSparks, OpengatesWorkspace } from "@/shared/proto/cline/account"
import { OLA_WORKSPACE_HEADER, type OlaWorkspace } from "./ola-workspace"
import { OLA_WEB_URL } from "./opengates-zawadi"

const sparks = z.number().int().nonnegative().max(1_000_000_000_000)

/** GET /v1/biashara/me: what the organisation gives this member. Limits are null when there is none. */
export const teamSchema = z.object({
	data: z.object({
		enabled: z.boolean(),
		limit_sparks: sparks.nullable(),
		extra_sparks: sparks,
		used_sparks: sparks,
		remaining_sparks: sparks.nullable(),
		own_sparks: z.boolean(),
		pool_empty: z.boolean().optional(),
		pending_request_sparks: sparks.optional(),
		month_ends: z.string().max(64).optional(),
	}),
})

export function toTeamSparks(body: z.infer<typeof teamSchema>): OpengatesTeamSparks {
	const v = body.data
	return OpengatesTeamSparks.create({
		enabled: v.enabled,
		limited: v.limit_sparks !== null,
		limit: v.limit_sparks ?? 0,
		extra: v.extra_sparks,
		used: v.used_sparks,
		remaining: v.remaining_sparks ?? 0,
		ownSparks: v.own_sparks,
		poolEmpty: v.pool_empty === true,
		pending: v.pending_request_sparks ?? 0,
		monthEnds: v.month_ends ?? "",
	})
}

/**
 * The organisation workspace Ola Code works in, with what the organisation gives this member. A failed read of
 * the team's Sparks still shows the workspace.
 */
export async function fetchWorkspace(
	fetcher: typeof globalThis.fetch,
	baseUrl: string,
	workspace: OlaWorkspace,
): Promise<OpengatesWorkspace> {
	const path = workspace.slug ?? workspace.id
	const out = OpengatesWorkspace.create({
		id: workspace.id,
		name: workspace.name,
		role: workspace.role ?? "member",
		sparksUrl: `${OLA_WEB_URL}/s/${path}/sparks`,
	})
	if (workspace.role === "owner") return out
	try {
		const response = await fetcher(`${baseUrl}/biashara/me`, {
			headers: { [OLA_WORKSPACE_HEADER]: workspace.id },
			signal: AbortSignal.timeout(15_000),
		})
		if (response.ok) out.team = toTeamSparks(teamSchema.parse(await response.json()))
		else await response.body?.cancel()
	} catch {
		// Biashara may be off or unreachable; the workspace still shows.
	}
	return out
}
