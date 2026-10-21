import { TaskItem } from "@shared/proto/cline/task"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import HistoryViewItem from "./HistoryViewItem"

const mocks = vi.hoisted(() => ({ open: vi.fn(), export: vi.fn() }))
vi.mock("@/services/grpc-client", () => ({
	TaskServiceClient: { showTaskWithId: mocks.open, exportTaskWithId: mocks.export },
}))
vi.mock("@/hooks/useUsageCostVisibility", () => ({ useUsageCostVisibility: () => () => false }))
vi.mock("@/components/cloud/CloudStatusPill", () => ({ CloudStatusPill: () => null }))

function renderItem(favorite = false) {
	const props = {
		item: TaskItem.create({
			id: "chat-1",
			task: "Build a login page",
			ts: Date.now(),
			isFavorited: favorite,
			modelId: "ola-code-pro",
		}),
		index: 0,
		selectedItems: [],
		pendingFavoriteToggles: {},
		handleDeleteHistoryItem: vi.fn(),
		toggleFavorite: vi.fn(),
		handleHistorySelect: vi.fn(),
		compact: true,
	}
	render(<HistoryViewItem {...props} />)
	return props
}

describe("Ola history conversation card", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.open.mockResolvedValue({})
		mocks.export.mockResolvedValue({})
	})

	it("opens the conversation using a keyboard-accessible button", () => {
		renderItem()
		fireEvent.click(screen.getByRole("button", { name: /^Build a login page/ }))
		expect(mocks.open).toHaveBeenCalledWith({ value: "chat-1" })
	})

	it("keeps selection and favorites separate from opening the conversation", () => {
		const props = renderItem()
		fireEvent.click(screen.getByRole("checkbox"))
		fireEvent.click(screen.getByRole("button", { name: "Add to favorites" }))
		expect(props.handleHistorySelect).toHaveBeenCalledWith("chat-1", true)
		expect(props.toggleFavorite).toHaveBeenCalledWith("chat-1", false)
		expect(mocks.open).not.toHaveBeenCalled()
	})

	it("reveals model details and exports a conversation", () => {
		renderItem()
		fireEvent.click(screen.getByRole("button", { name: "Details" }))
		expect(screen.getByText("ola-code-pro")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Hide details" })).toHaveAttribute("aria-expanded", "true")
		fireEvent.click(screen.getByRole("button", { name: "Export Build a login page" }))
		expect(mocks.export).toHaveBeenCalledWith({ value: "chat-1" })
	})

	it("protects favorites from deletion", () => {
		renderItem(true)
		expect(screen.getByRole("button", { name: "Delete Build a login page" })).toBeDisabled()
	})

	it("reports failures opening a conversation", async () => {
		mocks.open.mockRejectedValue(new Error("offline"))
		renderItem()
		fireEvent.click(screen.getByRole("button", { name: /^Build a login page/ }))
		await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not open"))
	})
})
