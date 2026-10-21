import type { ActiveEditorContext } from "@shared/proto/cline/ui"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ActiveEditorChip } from "./ActiveEditorChip"

const mocks = vi.hoisted(() => ({
	response: undefined as ((context: ActiveEditorContext) => void) | undefined,
	attach: vi.fn(),
	unsubscribe: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	UiServiceClient: {
		subscribeToActiveEditorContext: (
			_request: unknown,
			callbacks: { onResponse: (context: ActiveEditorContext) => void },
		) => {
			mocks.response = callbacks.onResponse
			return mocks.unsubscribe
		},
		getActiveEditorAttachment: mocks.attach,
	},
}))

function update(context: Partial<ActiveEditorContext> = {}) {
	act(() => mocks.response?.({ contextId: "editor-1", fileName: "main.tsx", languageId: "typescriptreact", ...context }))
}

describe("ActiveEditorChip", () => {
	beforeEach(() => vi.clearAllMocks())

	it("offers the active file without attaching it automatically, and cleans up", () => {
		const onAttach = vi.fn()
		const { unmount } = render(<ActiveEditorChip onAttach={onAttach} />)
		expect(screen.queryByRole("button")).not.toBeInTheDocument()
		update()
		expect(screen.getByRole("button", { name: "Attach main.tsx" })).toBeInTheDocument()
		expect(onAttach).not.toHaveBeenCalled()
		unmount()
		expect(mocks.unsubscribe).toHaveBeenCalledOnce()
	})

	it("shows selected lines and attaches their snapshot only on click", async () => {
		const onAttach = vi.fn()
		mocks.attach.mockResolvedValue({ value: "Selected lines 8-12 from main.tsx:\n```tsx\nhello\n```" })
		render(<ActiveEditorChip onAttach={onAttach} />)
		update({ startLine: 8, endLine: 12 })
		fireEvent.click(screen.getByRole("button", { name: "Attach main.tsx:8-12" }))
		await waitFor(() => expect(onAttach).toHaveBeenCalledWith(expect.stringContaining("Selected lines 8-12")))
		expect(mocks.attach).toHaveBeenCalledWith({ value: "editor-1" })
	})

	it("updates for a single selected line and hides when there is no eligible editor", () => {
		render(<ActiveEditorChip onAttach={vi.fn()} />)
		update({ startLine: 8, endLine: 8 })
		expect(screen.getByRole("button", { name: "Attach main.tsx:8" })).toBeInTheDocument()
		update({ contextId: "", fileName: "" })
		expect(screen.queryByRole("button")).not.toBeInTheDocument()
	})

	it("shows an explicit attachment error", async () => {
		mocks.attach.mockRejectedValue(new Error("stale selection"))
		render(<ActiveEditorChip onAttach={vi.fn()} />)
		update()
		fireEvent.click(screen.getByRole("button"))
		expect(await screen.findByRole("alert")).toHaveTextContent("Could not attach this file")
	})

	it("does not attach stale content when the active editor changes during the request", async () => {
		let finish: ((value: { value: string }) => void) | undefined
		mocks.attach.mockReturnValue(
			new Promise<{ value: string }>((resolve) => {
				finish = resolve
			}),
		)
		const onAttach = vi.fn()
		render(<ActiveEditorChip onAttach={onAttach} />)
		update()
		fireEvent.click(screen.getByRole("button"))
		update({ contextId: "editor-2", fileName: "other.ts" })
		await act(async () => finish?.({ value: "@/main.tsx" }))
		expect(onAttach).not.toHaveBeenCalled()
		expect(screen.getByRole("alert")).toHaveTextContent("active file or selection changed")
	})
})
