import { OpengatesAccount, OpengatesBundleOffer } from "@shared/proto/cline/account"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SparksUsage } from "./SparksUsage"
import { formatKes, offerValidity } from "./sparks-bundles"

const mocks = vi.hoisted(() => ({ startOpengatesPlanCheckout: vi.fn() }))
vi.mock("@/services/grpc-client", () => ({ AccountServiceClient: mocks }))

// 18 November 2026, 10:00 East Africa Time.
const now = new Date("2026-11-18T07:00:00Z")
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString()
const account = OpengatesAccount.create({
	tier: "free",
	status: "active",
	billingEnabled: true,
	sparks: {
		version: "sparks-v1",
		unit: "nano_usd",
		grantNusd: 200_000_000,
		usedNusd: 50_000_000,
		period: "p",
		resetAt: "2026-12-01T00:00:00Z",
		bundles: [
			{ id: "p1", product: "siku", grantedNusd: 230_000_000, usedNusd: 30_000_000, startsAt: at(-1), expiresAt: at(23) },
			{
				id: "p2",
				product: "usiku",
				grantedNusd: 100_000_000,
				startsAt: at(-1),
				expiresAt: at(19),
				windowed: true,
				fromHour: 23,
				toHour: 5,
			},
		],
	},
	products: [
		{
			id: "siku",
			currency: "KES",
			amount: 5000,
			billingVersion: "sparks-v1",
			onSale: true,
			bundle: { name: "Siku", label: "One day", sparks: 230000, hours: 24 },
		},
		{
			id: "usiku",
			currency: "KES",
			amount: 2000,
			billingVersion: "sparks-v1",
			onSale: true,
			bundle: { name: "Usiku", label: "Late night", sparks: 100000, windowed: true, fromHour: 23, toHour: 5 },
		},
		{
			id: "hadi-usiku",
			currency: "KES",
			amount: 4000,
			billingVersion: "sparks-v1",
			onSale: false,
			bundle: { name: "Hadi Usiku", label: "Until midnight", sparks: 170000, untilMidnight: true, sellUntilHour: 21 },
		},
		{
			id: "top-up-50",
			currency: "KES",
			amount: 5000,
			billingVersion: "sparks-v1",
			onSale: true,
			bundle: { name: "Top-up 50", label: "Never expires", sparks: 200000, topUp: true },
		},
	],
})

describe("Sparks bundles view", () => {
	beforeEach(() => vi.clearAllMocks())

	it("counts bundles usable now in the balance and lists running bundles", () => {
		render(<SparksUsage account={account} now={now} />)
		// 150,000 monthly + 200,000 left on Siku; Usiku waits for 11 PM.
		expect(screen.getByLabelText("Available Sparks")).toHaveTextContent("350,000 Sparks")
		const running = screen.getByTestId("running-bundles")
		expect(running).toHaveTextContent("Siku")
		expect(running).toHaveTextContent("23 hours left")
		expect(running).toHaveTextContent("starts at 11 PM")
		expect(screen.queryByText(/search costs are covered by Ola/)).not.toBeInTheDocument()
	})

	it("buys a bundle, and keeps one off sale disabled", async () => {
		render(<SparksUsage account={account} now={now} />)
		fireEvent.click(screen.getByRole("button", { name: "Buy Siku for KES 50", hidden: true }))
		await waitFor(() => expect(mocks.startOpengatesPlanCheckout).toHaveBeenCalledWith({ value: "siku" }))
		const closed = screen.getByRole("button", { name: "Buy Hadi Usiku for KES 40", hidden: true })
		expect(closed).toBeDisabled()
		expect(closed).toHaveTextContent("Sold until 9 PM")
	})

	it("shows a failed checkout where it can be seen", async () => {
		mocks.startOpengatesPlanCheckout.mockRejectedValueOnce(new Error("no"))
		render(<SparksUsage account={account} now={now} />)
		fireEvent.click(screen.getByRole("button", { name: "Buy Top-up 50 for KES 50", hidden: true }))
		expect(await screen.findByRole("alert")).toHaveTextContent("Could not start checkout")
	})

	it("describes prices and validity in plain words", () => {
		expect(formatKes(195_000)).toBe("KES 1,950")
		expect(offerValidity(OpengatesBundleOffer.create({ name: "Wiki", sparks: 1, hours: 168 }))).toBe("7 days")
		expect(
			offerValidity(OpengatesBundleOffer.create({ name: "Usiku", sparks: 1, windowed: true, fromHour: 23, toHour: 5 })),
		).toBe("11 PM to 5 AM")
	})
})
