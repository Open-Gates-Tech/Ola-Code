import { z } from "zod"
import { OpengatesSubscriptionStatus } from "@/shared/proto/cline/account"

const offerSchema = z.object({ name: z.string(), sparks: z.number(), hours: z.number().optional() })
const planProductSchema = z.object({
	id: z.string(),
	currency: z.string(),
	amount: z.number(),
	tier: z.string().optional(),
	bundle: offerSchema.optional(),
})

/** GET /v1/billing/subscription: { data: null } or the subscription with what renews next. */
export const subscriptionSchema = z.object({
	data: z
		.object({
			subscription: z.object({
				product: planProductSchema,
				auto_renew: z.boolean(),
				state: z.string(),
				period_end: z.string(),
				next_charge_at: z.string().optional(),
				card_last4: z.string().optional(),
				notice: z.object({ from: z.string(), to: planProductSchema, moves_at: z.string() }).optional().nullable(),
			}),
			can_auto_renew: z.boolean().optional(),
		})
		.nullable(),
})
export type SubscriptionReply = z.infer<typeof subscriptionSchema>

const PLAN_NAMES: Record<string, string> = { pro: "Ola Pro", ultra: "Ola Ultra", ultra_plus: "Ola Ultra Plus" }
const sparks = new Intl.NumberFormat("en", { maximumFractionDigits: 0 })
const shillings = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 })
const kes = (cents: number) => `KES ${shillings.format(cents / 100)}`

/** "18 Dec 2026", in East Africa Time. */
export function planDate(iso: string | undefined): string {
	const time = iso ? Date.parse(iso) : Number.NaN
	if (!Number.isFinite(time) || time <= 0) return ""
	return new Date(time).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "Africa/Nairobi",
	})
}

type PlanProduct = z.infer<typeof planProductSchema>
const bundleName = (p: PlanProduct) => p.bundle?.name ?? "your bundle"
const days = (p: PlanProduct) => Math.max(1, Math.round((p.bundle?.hours ?? 720) / 24))

/** Words the subscription for the account view, the same way Ola on the web does. Undefined when there is nothing to say. */
export function subscriptionStatus(reply: SubscriptionReply, now: Date = new Date()): OpengatesSubscriptionStatus | undefined {
	const view = reply.data
	if (!view) return undefined
	const sub = view.subscription
	const card = sub.card_last4 ? `your card ending ${sub.card_last4}` : "your saved card"
	if (sub.notice) {
		const from = PLAN_NAMES[sub.notice.from] ?? "Your plan"
		const to = sub.notice.to
		if (sub.auto_renew) {
			return OpengatesSubscriptionStatus.create({
				moving: true,
				title: `${from} becomes ${bundleName(to)} on ${planDate(sub.notice.moves_at)}`,
				detail: `From then it's ${kes(to.amount)} every ${days(to)} days for ${sparks.format(to.bundle?.sparks ?? 0)} Sparks, charged to ${card}. ${from} and its Sparks carry on until then.`,
				actionLabel: "Cancel instead",
				actionRenew: false,
			})
		}
		return OpengatesSubscriptionStatus.create({
			title: `${from} ends on ${planDate(sub.period_end)}`,
			detail: "It won't renew, and nothing more will be charged. You can buy a bundle whenever you need one.",
			actionLabel: view.can_auto_renew ? `Move to ${bundleName(to)} instead` : "",
			actionRenew: true,
		})
	}
	if (!sub.product.bundle) return undefined
	const name = bundleName(sub.product)
	if (sub.auto_renew) {
		return OpengatesSubscriptionStatus.create({
			title: `${name} renews every ${days(sub.product)} days`,
			detail: `Next: ${kes(sub.product.amount)} on ${planDate(sub.next_charge_at ?? sub.period_end)}, charged to ${card}.`,
			actionLabel: "Cancel renewal",
			actionRenew: false,
		})
	}
	if (Date.parse(sub.period_end) <= now.getTime()) return undefined
	return OpengatesSubscriptionStatus.create({
		title: `${name} won't renew`,
		detail: `Your current ${name} Sparks last until ${planDate(sub.period_end)}.`,
		actionLabel: view.can_auto_renew ? "Renew every month again" : "",
		actionRenew: true,
	})
}
