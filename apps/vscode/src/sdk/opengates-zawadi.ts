import { z } from "zod"
import { OpengatesZawadi } from "@/shared/proto/cline/account"

/** Where invite links and the Zawadi explainer live: Ola on the web, where a friend signs up. */
export const OLA_WEB_URL = "https://ola.opengates.app"

const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/
const count = z.number().int().nonnegative().max(1_000_000_000)

/** GET /v1/zawadi: the person's invite code and how their invites are doing. */
export const zawadiSchema = z.object({
	data: z.object({
		code: z.string().regex(CODE),
		invited: count,
		rewarded: count,
		left_this_month: count,
		reward_sparks: count,
		reward_days: count,
		messages_needed: count,
		monthly_limit: count,
		invited_by: z.object({ state: z.enum(["pending", "rewarded"]), messages: count }).nullish(),
	}),
})

/** The invite as the Sparks view shows it, with the link to share and a WhatsApp message carrying it. */
export function toZawadi(body: z.infer<typeof zawadiSchema>): OpengatesZawadi {
	const v = body.data
	const link = `${OLA_WEB_URL}/z/${v.code}`
	const text = `Join me on Ola, the AI assistant made for Kenya. Sign up with my link and we both get ${v.reward_sparks.toLocaleString("en-KE")} free Sparks: ${link}`
	return OpengatesZawadi.create({
		code: v.code,
		link,
		shareUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
		aboutUrl: `${OLA_WEB_URL}/zawadi`,
		invited: v.invited,
		rewarded: v.rewarded,
		leftThisMonth: v.left_this_month,
		rewardSparks: v.reward_sparks,
		rewardDays: v.reward_days,
		messagesNeeded: v.messages_needed,
		monthlyLimit: v.monthly_limit,
		invitedByState: v.invited_by?.state ?? "",
		invitedByMessages: v.invited_by?.messages ?? 0,
	})
}
