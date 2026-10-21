import type { ClineMessage } from "@shared/ExtensionMessage"
import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MessageHandlers } from "../../types/chatTypes"
import { createMessageRenderer } from "./MessageRenderer"

const state = vi.hoisted(() => ({ mode: "act", opengatesAuthEnabled: true }))
vi.mock("@/context/ExtensionStateContext", () => ({ useExtensionState: () => state }))
vi.mock("@/components/chat/ChatRow", () => ({ default: () => <div>Response content</div> }))
vi.mock("@/components/chat/BrowserSessionRow", () => ({ default: () => null }))
vi.mock("./ToolGroupRenderer", () => ({ ToolGroupRenderer: () => null }))

function renderMessage(message: ClineMessage) {
	const renderRow = createMessageRenderer(
		[message],
		[message],
		{},
		vi.fn(),
		vi.fn(),
		vi.fn(),
		vi.fn(),
		"",
		{} as MessageHandlers,
		false,
	)
	return render(renderRow(0, message))
}

describe("Ola response presentation", () => {
	beforeEach(() => {
		state.opengatesAuthEnabled = true
	})

	it.each(["text", "completion_result", "plan_completion_result"] as const)("styles assistant %s responses", (say) => {
		const { container } = renderMessage({ ts: 1, type: "say", say, text: "Hello" })
		expect(container.firstElementChild).toHaveClass("ola-assistant-message")
	})

	it("does not style user messages as assistant cards", () => {
		const { container } = renderMessage({ ts: 1, type: "say", say: "user_feedback", text: "Hello" })
		expect(container.firstElementChild).not.toHaveClass("ola-assistant-message")
	})

	it("preserves the existing presentation outside Ola", () => {
		state.opengatesAuthEnabled = false
		const { container } = renderMessage({ ts: 1, type: "say", say: "text", text: "Hello" })
		expect(container.firstElementChild).not.toHaveClass("ola-assistant-message")
	})
})
