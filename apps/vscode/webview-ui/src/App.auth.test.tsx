import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"

const mocks = vi.hoisted(() => ({
	state: {} as Record<string, unknown>,
	auth: {} as Record<string, unknown>,
}))

vi.mock("./context/ExtensionStateContext", () => ({ useExtensionState: () => mocks.state }))
vi.mock("./context/ClineAuthContext", () => ({ useClineAuth: () => mocks.auth }))
vi.mock("./Providers", () => ({ Providers: ({ children }: { children: ReactNode }) => children }))
vi.mock("./components/account/AccountWelcomeView", () => ({
	AccountWelcomeView: () => <button>Sign In with Opengates</button>,
}))
vi.mock("./components/chat/ChatView", () => ({
	default: ({ isHidden }: { isHidden: boolean }) => <textarea aria-label="Chat draft" hidden={isHidden} />,
}))
vi.mock("./components/account/AccountView", () => ({ default: () => null }))
vi.mock("./components/history/HistoryView", () => ({
	default: ({ onDone }: { onDone: () => void }) => (
		<div>
			Chat history
			<button onClick={onDone}>Done</button>
		</div>
	),
}))
vi.mock("./components/marketplace/MarketplaceView", () => ({ default: () => null }))
vi.mock("./components/mcp/configuration/McpConfigurationView", () => ({ default: () => <div>MCP servers</div> }))
vi.mock("./components/settings/SettingsView", () => ({ default: () => <div>Settings screen</div> }))
vi.mock("./components/worktrees/WorktreesView", () => ({ default: () => null }))
vi.mock("./components/onboarding/OnboardingView", () => ({ default: () => <div>Original onboarding</div> }))
vi.mock("./components/onboarding/clinePassSubscribe", () => ({ openClinePassSubscriptionIfPending: vi.fn() }))
vi.mock("./services/grpc-client", () => ({ UiServiceClient: {} }))

beforeEach(() => {
	mocks.state = { didHydrateState: true, opengatesAuthEnabled: true }
	mocks.auth = { clineUser: null, isAuthReady: true, authError: null }
})

describe("Opengates sidebar authentication gate", () => {
	it("shows only sign-in before authentication, even after onboarding", () => {
		render(<App />)
		expect(screen.getByRole("button", { name: "Sign In with Opengates" })).toBeVisible()
		expect(screen.queryByLabelText("Chat draft")).not.toBeInTheDocument()
	})

	it("waits for session restoration without flashing chat", () => {
		mocks.auth.isAuthReady = false
		render(<App />)
		expect(screen.getByRole("status")).toHaveTextContent("Restoring")
		expect(screen.queryByLabelText("Chat draft")).not.toBeInTheDocument()
	})

	it("opens chat for an authenticated Opengates user without Cline onboarding", () => {
		mocks.state.showWelcome = true
		mocks.auth.clineUser = { uid: "opengates-user" }
		render(<App />)
		expect(screen.getByLabelText("Chat draft")).toBeVisible()
		expect(screen.queryByText("Original onboarding")).not.toBeInTheDocument()
	})

	it("hides chat on logout and preserves the draft across signing back in", () => {
		mocks.auth.clineUser = { uid: "opengates-user" }
		const { rerender } = render(<App />)
		const draft = screen.getByLabelText("Chat draft")
		fireEvent.change(draft, { target: { value: "Keep this draft" } })
		mocks.auth.clineUser = null
		rerender(<App />)
		expect(screen.getByRole("button", { name: "Sign In with Opengates" })).toBeVisible()
		expect(draft).not.toBeVisible()
		mocks.auth.clineUser = { uid: "opengates-user" }
		rerender(<App />)
		expect(screen.getByLabelText("Chat draft")).toBe(draft)
		expect(draft).toBeVisible()
		expect(draft).toHaveValue("Keep this draft")
	})

	it("fails closed with a visible error when auth status cannot be read", () => {
		mocks.auth.authError = "Could not read account status."
		render(<App />)
		expect(screen.getByRole("alert")).toHaveTextContent("Could not read account status.")
		expect(screen.queryByLabelText("Chat draft")).not.toBeInTheDocument()
	})

	it("preserves original onboarding for other hosts", () => {
		mocks.state.opengatesAuthEnabled = false
		mocks.state.showWelcome = true
		render(<App />)
		expect(screen.getByText("Original onboarding")).toBeVisible()
		expect(screen.queryByText("Sign In with Opengates")).not.toBeInTheDocument()
	})

	it("ignores settings navigation in Ola without hiding the conversation", () => {
		mocks.auth.clineUser = { uid: "opengates-user" }
		mocks.state.showSettings = true
		render(<App />)
		expect(screen.queryByText("Settings screen")).not.toBeInTheDocument()
		expect(screen.getByLabelText("Chat draft")).toBeVisible()
	})

	it("retains settings for other hosts", () => {
		mocks.state.opengatesAuthEnabled = false
		mocks.state.showSettings = true
		render(<App />)
		expect(screen.getByText("Settings screen")).toBeVisible()
	})

	it("opens history for Ola and preserves the draft when returning to chat", () => {
		mocks.auth.clineUser = { uid: "opengates-user" }
		mocks.state.hideHistory = vi.fn(() => {
			mocks.state.showHistory = false
		})
		const { rerender } = render(<App />)
		const draft = screen.getByLabelText("Chat draft")
		fireEvent.change(draft, { target: { value: "Keep my draft" } })
		mocks.state.showHistory = true
		rerender(<App />)
		expect(screen.getByText("Chat history")).toBeVisible()
		expect(draft).not.toBeVisible()
		fireEvent.click(screen.getByRole("button", { name: "Done" }))
		rerender(<App />)
		expect(screen.queryByText("Chat history")).not.toBeInTheDocument()
		expect(screen.getByLabelText("Chat draft")).toBe(draft)
		expect(draft).toBeVisible()
		expect(draft).toHaveValue("Keep my draft")
	})

	it("retains history navigation for other hosts", () => {
		mocks.state.opengatesAuthEnabled = false
		mocks.state.showHistory = true
		render(<App />)
		expect(screen.getByText("Chat history")).toBeVisible()
		expect(screen.getByLabelText("Chat draft")).not.toBeVisible()
	})

	it("opens MCP configuration directly instead of the marketplace in Ola", () => {
		mocks.auth.clineUser = { uid: "opengates-user" }
		mocks.state.showMarketplace = true
		render(<App />)
		expect(screen.getByText("MCP servers")).toBeVisible()
		expect(screen.getByLabelText("Chat draft")).not.toBeVisible()
	})
})
