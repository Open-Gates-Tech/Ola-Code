import { describe, expect, it } from "vitest"
import { toZawadi, zawadiSchema } from "./opengates-zawadi"

const body = {
	data: {
		code: "AB3DEF",
		invited: 2,
		rewarded: 1,
		left_this_month: 9,
		reward_sparks: 100000,
		reward_days: 7,
		messages_needed: 5,
		monthly_limit: 10,
	},
}

describe("Zawadi in Ola Code", () => {
	it("builds the invite link, a WhatsApp share and the explainer link", () => {
		const z = toZawadi(zawadiSchema.parse(body))
		expect(z).toMatchObject({
			code: "AB3DEF",
			link: "https://ola.opengates.app/z/AB3DEF",
			aboutUrl: "https://ola.opengates.app/zawadi",
		})
		expect(z.shareUrl.startsWith("https://wa.me/?text=")).toBe(true)
		expect(decodeURIComponent(z.shareUrl)).toContain("we both get 100,000 free Sparks: https://ola.opengates.app/z/AB3DEF")
		expect(z.invitedByState).toBe("")
	})

	it("carries whether the person joined with a friend's code", () => {
		const z = toZawadi(zawadiSchema.parse({ data: { ...body.data, invited_by: { state: "pending", messages: 3 } } }))
		expect(z).toMatchObject({ invitedByState: "pending", invitedByMessages: 3 })
	})

	it("refuses a code Ola would never issue, so no link is built from it", () => {
		expect(() => zawadiSchema.parse({ data: { ...body.data, code: "ab3def" } })).toThrow()
		expect(() => zawadiSchema.parse({ data: { ...body.data, code: "AB3DE/" } })).toThrow()
		expect(() => zawadiSchema.parse({ data: { ...body.data, invited: -1 } })).toThrow()
	})
})
