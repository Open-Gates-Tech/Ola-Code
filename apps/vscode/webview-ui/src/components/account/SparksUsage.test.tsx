import { OpengatesAccount } from "@shared/proto/cline/account"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OpengatesAccountView } from "./OpengatesAccountView"
import { formatSparks } from "./SparksUsage"

const mocks = vi.hoisted(() => ({
	getOpengatesAccount: vi.fn(),
	startOpengatesPlanCheckout: vi.fn(),
	startOpengatesSubscription: vi.fn(),
	setOpengatesAutoRenew: vi.fn(),
}))
vi.mock("@/services/grpc-client", () => ({ AccountServiceClient: mocks }))
const user = { uid: "u", displayName: "Pilot" }
const account = OpengatesAccount.create({
	tier: "pro",
	status: "active",
	billingEnabled: true,
	sparks: {
		version: "sparks-v1",
		unit: "nano_usd",
		grantNusd: 5_000_000_000,
		usedNusd: 1,
		heldNusd: 999,
		purchasedNusd: 1001,
		purchasedHeldNusd: 1,
		period: "2026-10",
		resetAt: "2026-11-22T00:00:00Z",
	},
	products: [
		{
			id: "mwezi",
			currency: "KES",
			amount: 65000,
			billingVersion: "sparks-v1",
			onSale: true,
			subscribable: true,
			bundle: { name: "Mwezi", label: "30 days", sparks: 3400000, hours: 720 },
		},
	],
	sparksCalls: [{ id: "r", model: "mini", role: "generation", state: "uncharged_unknown", timestamp: "2026-10-22T00:00:00Z" }],
})

describe("Sparks wallet UI", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getOpengatesAccount.mockResolvedValue(account)
	})
	it("shows one real wallet, fractional usage, held and purchased funds without legacy meters or cash balances", async () => {
		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByLabelText("Available Sparks")).toHaveTextContent("5,000,000 Sparks")
		expect(screen.getByText("0.001 Sparks")).toBeInTheDocument()
		expect(screen.queryByText("Balanced & Deep")).not.toBeInTheDocument()
		expect(screen.queryByText(/USD/)).not.toBeInTheDocument()
		expect(screen.queryByText("Recent model calls and token diagnostics")).not.toBeInTheDocument()
		expect(screen.queryByText("Input tokens")).not.toBeInTheDocument()
		expect(screen.queryByText("mini")).not.toBeInTheDocument()
		expect(screen.queryByText(/\$.*model-cost/)).not.toBeInTheDocument()
	})
	it("shows Bure as free Sparks that refill at midnight", async () => {
		mocks.getOpengatesAccount.mockResolvedValue({
			...account,
			tier: "free",
			sparks: { ...account.sparks!, grantNusd: 25_000_000, daily: true },
		})
		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByText("Bure today (free)")).toBeInTheDocument()
		expect(screen.getByText("At midnight, East Africa Time")).toBeInTheDocument()
		expect(screen.getByLabelText("Bure Sparks left today")).toBeInTheDocument()
		expect(screen.queryByText("Monthly included")).not.toBeInTheDocument()
	})
	it("subscribes to Mwezi on a card, and still buys it once", async () => {
		render(<OpengatesAccountView user={user} />)
		fireEvent.click(await screen.findByRole("button", { name: "Subscribe to Mwezi for KES 650 a month", hidden: true }))
		await waitFor(() => expect(mocks.startOpengatesSubscription).toHaveBeenCalledWith({ value: "mwezi" }))
		fireEvent.click(screen.getByRole("button", { name: "Buy Mwezi for KES 650", hidden: true }))
		await waitFor(() => expect(mocks.startOpengatesPlanCheckout).toHaveBeenCalledWith({ value: "mwezi" }))
	})
	it("shows that Pro becomes Mwezi and lets the subscriber cancel instead", async () => {
		const moving = {
			...account,
			subscription: {
				title: "Ola Pro becomes Mwezi on 18 Dec 2026",
				detail: "From then it's KES 650 every 30 days for 3,400,000 Sparks, charged to your card ending 4081.",
				actionLabel: "Cancel instead",
				actionRenew: false,
				moving: true,
			},
		}
		mocks.getOpengatesAccount.mockResolvedValue(moving)
		render(<OpengatesAccountView user={user} />)
		const card = await screen.findByRole("region", { name: "Your subscription", hidden: true })
		expect(card).toHaveTextContent("Ola Pro becomes Mwezi on 18 Dec 2026")
		fireEvent.click(screen.getByRole("button", { name: "Cancel instead", hidden: true }))
		await waitFor(() => expect(mocks.setOpengatesAutoRenew).toHaveBeenCalledWith({ value: false }))
		// The account reloads to show the plan now ends instead.
		await waitFor(() => expect(mocks.getOpengatesAccount).toHaveBeenCalledTimes(2))
	})
	it("disables checkout when the server does not enable billing", async () => {
		mocks.getOpengatesAccount.mockResolvedValue({ ...account, billingEnabled: false })
		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByRole("button", { name: "Subscribe to Mwezi for KES 650 a month", hidden: true })).toBeDisabled()
		expect(screen.getByText(/Checkout is currently unavailable/)).toBeInTheDocument()
	})
	it("retains sub-Spark precision rather than rounding real usage to zero", () => {
		expect(formatSparks(1)).toBe("0.001")
		expect(formatSparks(1001)).toBe("1.001")
	})
})
