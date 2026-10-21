import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChangesSummaryBar } from "./ChangesSummaryBar"

const checkpointLatestChangesSummary = vi.fn()
const checkpointViewLatestChanges = vi.fn(() => Promise.resolve({}))
let extensionState: Record<string, unknown> = {}

vi.mock("@/services/grpc-client", () => ({
	CheckpointsServiceClient: {
		checkpointLatestChangesSummary: (...args: unknown[]) => checkpointLatestChangesSummary(...args),
		checkpointViewLatestChanges: () => checkpointViewLatestChanges(),
	},
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => extensionState,
}))

describe("ChangesSummaryBar", () => {
	beforeEach(() => {
		checkpointLatestChangesSummary.mockReset()
		checkpointViewLatestChanges.mockClear()
		extensionState = {
			currentTaskItem: { id: "task-1" },
			turnState: { phase: "completed", seq: 1 },
			enableCheckpointsSetting: true,
		}
	})

	it("shows files and line counts and opens the diff on click", async () => {
		checkpointLatestChangesSummary.mockResolvedValue({ files: 2, additions: 12, deletions: 3 })
		render(<ChangesSummaryBar />)

		const bar = await screen.findByTestId("ola-changes-summary")
		expect(bar).toHaveTextContent("2 files+12-3")
		expect(screen.getByText("+12")).toHaveClass("text-success")
		expect(screen.getByText("-3")).toHaveClass("text-error")

		fireEvent.click(bar)
		expect(checkpointViewLatestChanges).toHaveBeenCalledTimes(1)
	})

	it("renders nothing when there are no changes", async () => {
		checkpointLatestChangesSummary.mockResolvedValue({ files: 0, additions: 0, deletions: 0 })
		render(<ChangesSummaryBar />)

		await waitFor(() => expect(checkpointLatestChangesSummary).toHaveBeenCalled())
		expect(screen.queryByTestId("ola-changes-summary")).not.toBeInTheDocument()
	})

	it("does not fetch while Ola is still streaming", () => {
		extensionState.turnState = { phase: "streaming", seq: 2 }
		render(<ChangesSummaryBar />)

		expect(checkpointLatestChangesSummary).not.toHaveBeenCalled()
	})

	it("reads 'file(s) changed' under a response", async () => {
		checkpointLatestChangesSummary.mockResolvedValue({ files: 1, additions: 4, deletions: 0 })
		render(<ChangesSummaryBar variant="response" />)

		const summary = await screen.findByTestId("ola-response-changes-summary")
		expect(summary).toHaveTextContent("1 file changed+4-0")
		expect(screen.getByText("+4")).toHaveClass("text-success")
		expect(screen.getByText("-0")).toHaveClass("text-error")
	})
})
