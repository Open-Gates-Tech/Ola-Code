import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { formatPrice, OpengatesAccountView } from "./OpengatesAccountView"

const mocks = vi.hoisted(() => ({
	getOpengatesAccount: vi.fn(),
	startOpengatesUpgrade: vi.fn(),
	accountLogoutClicked: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({ AccountServiceClient: mocks }))

const user = { uid: "u1", displayName: "Ramazani Mwemedi", email: "ramazani@opengates.app" }
const freeAccount = {
	tier: "free",
	status: "active",
	creditsRemaining: 1200,
	fastRemaining: 250_000,
	reasonRemaining: 0,
	fastAllowance: 500_000,
	reasonAllowance: 0,
	resetAt: "2026-11-01T00:00:00.000Z",
	upgradeProduct: { id: "pro", currency: "KES", amount: 65000, days: 30 },
}

describe("OpengatesAccountView", () => {
	beforeEach(() => vi.clearAllMocks())

	it("shows the profile, plan, usage, and upgrade offer", async () => {
		mocks.getOpengatesAccount.mockResolvedValue(freeAccount)
		render(<OpengatesAccountView user={user} />)

		expect(screen.getByText("Ramazani Mwemedi")).toBeInTheDocument()
		expect(screen.getByText("ramazani@opengates.app")).toBeInTheDocument()
		expect(screen.getByText("RM")).toBeInTheDocument()

		expect(await screen.findByRole("progressbar", { name: "Fast allowance remaining" })).toHaveAttribute(
			"aria-valuenow",
			"50",
		)
		expect(screen.getByText("Pro only")).toBeInTheDocument()
		expect(screen.getByText("Ola Free")).toBeInTheDocument()
		expect(screen.getByText("1,200")).toBeInTheDocument()
		expect(screen.getByTestId("opengates-upgrade")).toBeInTheDocument()
		expect(screen.getByRole("link", { name: /Manage account/ })).toHaveAttribute(
			"href",
			"https://www.opengates.app/myaccount",
		)
	}, 20_000)

	it("starts the Pro checkout", async () => {
		mocks.getOpengatesAccount.mockResolvedValue(freeAccount)
		mocks.startOpengatesUpgrade.mockResolvedValue({ value: "https://checkout.paystack.com/abc" })
		render(<OpengatesAccountView user={user} />)
		fireEvent.click(await screen.findByRole("button", { name: /Upgrade for/ }))
		await waitFor(() => expect(mocks.startOpengatesUpgrade).toHaveBeenCalledTimes(1))
	})

	it("hides the upgrade offer and shows unlimited for internal accounts", async () => {
		mocks.getOpengatesAccount.mockResolvedValue({
			...freeAccount,
			tier: "internal",
			fastAllowance: -1,
			reasonAllowance: 5_000_000,
			reasonRemaining: 5_000_000,
			upgradeProduct: undefined,
		})
		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByText("Unlimited")).toBeInTheDocument()
		expect(screen.queryByTestId("opengates-upgrade")).not.toBeInTheDocument()
	})

	it("keeps sign out available when usage fails to load", async () => {
		mocks.getOpengatesAccount.mockRejectedValue(new Error("offline"))
		mocks.accountLogoutClicked.mockResolvedValue({})
		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your plan and usage.")
		fireEvent.click(screen.getByRole("button", { name: /Sign out/ }))
		await waitFor(() => expect(mocks.accountLogoutClicked).toHaveBeenCalledTimes(1))
	})

	it("formats minor-unit prices", () => {
		expect(formatPrice(65000, "KES")).toMatch(/650/)
	})
})
