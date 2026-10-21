import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OlaModelPicker } from "./OlaModelPicker"

const mocks = vi.hoisted(() => ({
	update: vi.fn(),
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({ apiConfiguration: {}, mode: "act" }),
}))
vi.mock("@/components/settings/utils/useApiConfigurationHandlers", () => ({
	useApiConfigurationHandlers: () => ({ handleFieldsChange: mocks.update }),
}))

beforeEach(() => {
	mocks.update.mockReset()
})

function openPicker() {
	fireEvent.click(screen.getByRole("button", { name: "Model" }))
	return screen.getByRole("listbox", { name: "Model" })
}

describe("Ola model picker", () => {
	it("offers Fast, Thinking, and Pro", () => {
		render(<OlaModelPicker />)
		const trigger = screen.getByRole("button", { name: "Model" })
		expect(trigger).toHaveTextContent("Fast")
		expect(trigger).toHaveAttribute("aria-expanded", "false")

		openPicker()
		expect(trigger).toHaveAttribute("aria-expanded", "true")
		expect(screen.getByRole("option", { name: /Fast/ })).toHaveAttribute("aria-selected", "true")
		expect(screen.getByRole("option", { name: /Thinking/ })).toBeEnabled()
		expect(screen.getByRole("option", { name: /Pro/ })).toBeEnabled()
	})

	it("persists Pro for both modes", async () => {
		mocks.update.mockResolvedValue(undefined)
		render(<OlaModelPicker />)
		openPicker()
		fireEvent.click(screen.getByRole("option", { name: /Pro/ }))
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith({
				planModeApiProvider: "openai",
				actModeApiProvider: "openai",
				planModeOpenAiModelId: "ola-code-pro",
				actModeOpenAiModelId: "ola-code-pro",
			}),
		)
	})

	it("persists the gateway model for both modes", async () => {
		mocks.update.mockResolvedValue(undefined)
		render(<OlaModelPicker />)
		openPicker()
		fireEvent.click(screen.getByRole("option", { name: /Thinking/ }))
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith({
				planModeApiProvider: "openai",
				actModeApiProvider: "openai",
				planModeOpenAiModelId: "ola-code-reason",
				actModeOpenAiModelId: "ola-code-reason",
			}),
		)
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
		await waitFor(() => expect(screen.getByRole("button", { name: "Model" })).toBeEnabled())
	})

	it("closes on Escape without reaching global shortcuts", () => {
		const onWindowKeyDown = vi.fn()
		window.addEventListener("keydown", onWindowKeyDown)
		try {
			render(<OlaModelPicker />)
			const listbox = openPicker()
			fireEvent.keyDown(listbox, { key: "Escape" })
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
			expect(onWindowKeyDown).not.toHaveBeenCalled()
		} finally {
			window.removeEventListener("keydown", onWindowKeyDown)
		}
	})

	it("shows a failure instead of claiming the model changed", async () => {
		mocks.update.mockRejectedValue(new Error("Offline"))
		render(<OlaModelPicker />)
		openPicker()
		fireEvent.click(screen.getByRole("option", { name: /Thinking/ }))
		expect(await screen.findByRole("alert")).toHaveTextContent("Could not change model")
		expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Fast")
	})
})
