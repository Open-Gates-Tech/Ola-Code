import { fireEvent, render, screen } from "@testing-library/react"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Navbar } from "./Navbar"

const navigateToChat = vi.fn()
const ola = vi.hoisted(() => ({ enabled: false, mcp: vi.fn(), worktrees: vi.fn() }))
vi.mock("../../context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		navigateToAccount: vi.fn(),
		navigateToChat,
		navigateToHistory: vi.fn(),
		navigateToMarketplace: vi.fn(),
		navigateToSettings: vi.fn(),
		opengatesAuthEnabled: ola.enabled,
		navigateToMcp: ola.mcp,
		navigateToWorktrees: ola.worktrees,
	}),
}))

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
		<button {...props}>{children}</button>
	),
}))

vi.mock("@/components/ui/tooltip", () => ({
	Tooltip: ({ children }: PropsWithChildren) => <>{children}</>,
	TooltipContent: ({ children }: PropsWithChildren) => <>{children}</>,
	TooltipTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
}))

describe("Navbar", () => {
	beforeEach(() => {
		navigateToChat.mockClear()
		ola.enabled = false
		ola.mcp.mockClear()
		ola.worktrees.mockClear()
	})

	it("keeps only new chat, MCP servers, and Worktrees in Ola", () => {
		ola.enabled = true
		render(<Navbar startNewTask={vi.fn()} />)
		expect(screen.getAllByRole("button")).toHaveLength(3)
		expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "MCP servers" }))
		fireEvent.click(screen.getByRole("button", { name: "Worktrees" }))
		expect(ola.mcp).toHaveBeenCalled()
		expect(ola.worktrees).toHaveBeenCalled()
	})

	it("starts a navbar task transition before navigating to chat", async () => {
		const startNewTask = vi.fn().mockResolvedValue(true)
		render(<Navbar startNewTask={startNewTask} />)

		fireEvent.click(screen.getByRole("button", { name: "New Task" }))

		await vi.waitFor(() => expect(startNewTask).toHaveBeenCalledWith("navbar"))
		expect(navigateToChat).toHaveBeenCalledTimes(1)
	})

	it("does not navigate when another recovery action owns the task", async () => {
		const startNewTask = vi.fn().mockResolvedValue(false)
		render(<Navbar startNewTask={startNewTask} />)

		fireEvent.click(screen.getByRole("button", { name: "New Task" }))

		await vi.waitFor(() => expect(startNewTask).toHaveBeenCalledWith("navbar"))
		expect(navigateToChat).not.toHaveBeenCalled()
	})
})
