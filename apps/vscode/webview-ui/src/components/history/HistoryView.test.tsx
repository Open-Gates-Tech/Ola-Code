import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import HistoryView from "./HistoryView"

const mocks = vi.hoisted(() => ({ load: vi.fn(), setSize: vi.fn() }))
vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		opengatesAuthEnabled: true,
		taskHistory: [],
		environment: "production",
		totalTasksSize: 0,
		setTotalTasksSize: mocks.setSize,
	}),
}))
vi.mock("@/hooks/useResolvedCloudStatuses", () => ({ useResolvedCloudStatuses: () => new Map() }))
vi.mock("@/services/grpc-client", () => ({ TaskServiceClient: { getTaskHistory: mocks.load } }))
vi.mock("../common/ViewHeader", () => ({ default: () => <h1>Chat history</h1> }))
vi.mock("./HistoryViewItem", () => ({ default: () => null }))
vi.mock("react-virtuoso", () => ({
	GroupedVirtuoso: ({ className }: { className: string }) => <div className={className} data-testid="history-scroller" />,
}))
vi.mock("@vscode/webview-ui-toolkit/react", () => ({ VSCodeTextField: () => null }))

describe("Ola history controls", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.load.mockResolvedValue({ tasks: [], hasMore: false })
	})

	it("shows a helpful empty state and keeps cleanup secondary", async () => {
		render(<HistoryView onDone={vi.fn()} />)
		expect(await screen.findByText("Your conversations will appear here")).toBeInTheDocument()
		expect(screen.getByText("Storage & cleanup").parentElement).not.toHaveAttribute("open")
		expect(screen.getByRole("button", { name: "Select loaded" })).toBeDisabled()
	})

	it("caps the Ola section width and scrolls the list separately from its controls", async () => {
		const { container } = render(<HistoryView onDone={vi.fn()} />)
		await screen.findByText("Your conversations will appear here")
		expect(container.firstElementChild).toHaveClass("ola-content-column")
		const scroller = screen.getByTestId("history-scroller")
		expect(scroller).toHaveClass("ola-chat-scrollbar", "h-full", "overflow-y-scroll")
		expect(scroller.parentElement).toHaveClass("min-h-0", "overflow-hidden")
		expect(scroller).not.toContainElement(screen.getByRole("searchbox"))
		expect(scroller).not.toContainElement(screen.getByRole("button", { name: "Select loaded" }))
	})

	it("uses the existing search and workspace filters", async () => {
		render(<HistoryView onDone={vi.fn()} />)
		fireEvent.change(screen.getByRole("searchbox", { name: "Search conversations" }), { target: { value: "login" } })
		fireEvent.click(screen.getByRole("button", { name: "This workspace" }))
		await waitFor(() =>
			expect(mocks.load).toHaveBeenLastCalledWith(
				expect.objectContaining({ searchQuery: "login", currentWorkspaceOnly: true }),
			),
		)
		expect(screen.getByRole("button", { name: "This workspace" })).toHaveAttribute("aria-pressed", "true")
		expect(await screen.findByText("No matching conversations")).toBeInTheDocument()
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
		})
		expect(screen.getByRole("searchbox")).toHaveValue("")
	})

	it("shows loading failures and lets the user retry", async () => {
		mocks.load.mockRejectedValueOnce(new Error("offline"))
		render(<HistoryView onDone={vi.fn()} />)
		expect(await screen.findByRole("alert")).toHaveTextContent("Could not load conversations")
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))
		expect(await screen.findByText("Your conversations will appear here")).toBeInTheDocument()
	})
})
