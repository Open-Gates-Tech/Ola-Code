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
	fastLimit: 500_000,
	reasonLimit: 0,
	allowancePolicyVersion: 1,
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
		expect(screen.getByText("Not included")).toBeInTheDocument()
		expect(screen.getByText("Thinking & Pro")).toBeInTheDocument()
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
			fastLimit: -1,
			reasonLimit: 5_000_000,
			reasonRemaining: 5_000_000,
			upgradeProduct: undefined,
		})
		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByText("Unlimited")).toBeInTheDocument()
		expect(screen.queryByTestId("opengates-upgrade")).not.toBeInTheDocument()
	})

	it("shows reported balances without guessed totals or percentages for an older server", async () => {
		mocks.getOpengatesAccount.mockResolvedValue({
			...freeAccount,
			fastLimit: undefined,
			reasonLimit: undefined,
			allowancePolicyVersion: undefined,
			// Legacy client guesses must not be used as authoritative totals.
			fastAllowance: 500_000,
			reasonAllowance: 0,
		})

		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByText("250K reported tokens remaining")).toBeInTheDocument()
		expect(screen.getByText("0 reported tokens remaining")).toBeInTheDocument()
		expect(screen.getAllByText("Total unavailable")).toHaveLength(2)
		expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
		expect(screen.queryByText(/% left/)).not.toBeInTheDocument()
		expect(screen.queryByText("Not included")).not.toBeInTheDocument()
	})

	it("labels Standard and Premium shadow balances as non-enforcing evaluation data", async () => {
		mocks.getOpengatesAccount.mockResolvedValue({
			...freeAccount,
			agentBudgetTask: {
				mode: "shadow",
				enforcementEnabled: false,
				customerConsumption: false,
				riskDependencyMissing: true,
				id: "task-1",
				preset: "feature",
				capNusd: 450_000_000,
				shadowUsedNusd: 25_000_000,
				shadowHeldNusd: 5_000_000,
				iterations: 2,
				maxIterations: 10,
				premiumAuthorized: true,
				standard: { grantNusd: 2_500_000_000, availableNusd: 2_445_000_000, heldNusd: 5_000_000 },
				premium: { grantNusd: 1_000_000_000, availableNusd: 1_000_000_000, heldNusd: 0 },
			},
		})
		render(<OpengatesAccountView user={user} />)

		expect(await screen.findByTestId("opengates-agent-budget")).toBeInTheDocument()
		expect(screen.getByText(/Evaluation only — shadow grants are not active budgets/)).toBeInTheDocument()
		expect(screen.getByText("Standard shadow evaluation grant")).toBeInTheDocument()
		expect(screen.getByText("Premium shadow evaluation grant")).toBeInTheDocument()
		expect(
			screen.getByText(
				"2,500,000 Sparks equivalent grant; 2,445,000 Sparks equivalent remaining; 5,000 Sparks equivalent held",
			),
		).toBeInTheDocument()
		expect(screen.getByText(/Provider-risk dependency is missing/)).toBeInTheDocument()
	})

	it("handles independently absent limits without treating an unknown negative balance as unlimited", async () => {
		mocks.getOpengatesAccount.mockResolvedValue({ ...freeAccount, reasonLimit: undefined, reasonRemaining: -1 })
		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByRole("progressbar", { name: "Fast allowance remaining" })).toBeInTheDocument()
		expect(screen.getByText("Remaining unavailable")).toBeInTheDocument()
		expect(screen.queryByText("Unlimited")).not.toBeInTheDocument()
	})

	it("uses server totals rather than tier defaults and does not clamp the reported balance", async () => {
		mocks.getOpengatesAccount.mockResolvedValue({ ...freeAccount, fastLimit: 100_000 })
		render(<OpengatesAccountView user={user} />)
		expect(await screen.findByText("250K of 100K tokens remaining")).toBeInTheDocument()
		expect(screen.getByRole("progressbar", { name: "Fast allowance remaining" })).toHaveAttribute("aria-valuenow", "100")
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
