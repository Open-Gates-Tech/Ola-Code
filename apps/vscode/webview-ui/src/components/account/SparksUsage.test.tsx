import { OpengatesAccount } from "@shared/proto/cline/account"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OpengatesAccountView } from "./OpengatesAccountView"
import { formatSparks } from "./SparksUsage"

const mocks = vi.hoisted(() => ({ getOpengatesAccount: vi.fn(), startOpengatesPlanCheckout: vi.fn() }))
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
	products: [{ id: "ultra-usd", currency: "USD", amount: 1500, tier: "ultra", billingVersion: "sparks-v1" }],
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
		expect(screen.queryByText("Thinking & Pro")).not.toBeInTheDocument()
		expect(screen.getByText("Ultra Plus")).toBeInTheDocument()
		expect(screen.getByText("Usage unknown - not charged")).toBeInTheDocument()
		expect(screen.getAllByText("Not reported")).toHaveLength(4)
		expect(screen.queryByText(/\$.*model-cost/)).not.toBeInTheDocument()
	})
	it("selects a catalog product rather than always starting a Pro checkout", async () => {
		render(<OpengatesAccountView user={user} />)
		fireEvent.click(await screen.findByRole("button", { name: "Choose Ultra", hidden: true }))
		await waitFor(() => expect(mocks.startOpengatesPlanCheckout).toHaveBeenCalledWith({ value: "ultra-usd" }))
	})
	it("disables checkout when the server does not enable billing", async () => {
		mocks.getOpengatesAccount.mockResolvedValue({ ...account, billingEnabled: false })
		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByRole("button", { name: "Choose Ultra", hidden: true })).toBeDisabled()
		expect(screen.getByText(/Checkout is currently unavailable/)).toBeInTheDocument()
	})
	it("retains sub-Spark precision rather than rounding real usage to zero", () => {
		expect(formatSparks(1)).toBe("0.001")
		expect(formatSparks(1001)).toBe("1.001")
	})
})
