import { OpengatesZawadi } from "@shared/proto/cline/account"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ZawadiCard } from "./ZawadiCard"

const zawadi = OpengatesZawadi.create({
	code: "AB3DEF",
	link: "https://ola.opengates.app/z/AB3DEF",
	shareUrl: "https://wa.me/?text=x",
	aboutUrl: "https://ola.opengates.app/zawadi",
	invited: 2,
	rewarded: 1,
	leftThisMonth: 9,
	rewardSparks: 100000,
	rewardDays: 7,
	messagesNeeded: 5,
	monthlyLimit: 10,
})

describe("ZawadiCard", () => {
	it("shows the reward, the link and how invites are doing", () => {
		render(<ZawadiCard zawadi={zawadi} />)
		expect(screen.getByText(/you both get 100,000 Sparks for 7 days/)).toBeTruthy()
		expect(screen.getByText("https://ola.opengates.app/z/AB3DEF")).toBeTruthy()
		expect(
			screen.getByText(/2 friends have joined, 1 rewarded\. You can earn Zawadi for 9 more friends this month\./),
		).toBeTruthy()
		expect(screen.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href")).toBe("https://wa.me/?text=x")
	})

	it("copies the invite link", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		Object.assign(navigator, { clipboard: { writeText } })
		render(<ZawadiCard zawadi={zawadi} />)
		fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }))
		await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy())
		expect(writeText).toHaveBeenCalledWith("https://ola.opengates.app/z/AB3DEF")
	})

	it("tells someone who joined with a friend's link how close they are", () => {
		render(<ZawadiCard zawadi={{ ...zawadi, invitedByState: "pending", invitedByMessages: 3 }} />)
		expect(screen.getByText(/3 of 5 messages sent toward your Zawadi/)).toBeTruthy()
	})
})
