import { PlanActMode } from "@shared/proto/cline/state"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { StateServiceClient } from "@/services/grpc-client"
import ChatTextArea from "./ChatTextArea"

const mocks = vi.hoisted(() => ({
	supportsImages: true as boolean | undefined,
	navigateToSettingsModelPicker: vi.fn(),
	cloudState: {} as Record<string, unknown>,
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		mode: "act",
		apiConfiguration: {},
		openRouterModels: {},
		platform: "darwin",
		localWorkflowToggles: {},
		globalWorkflowToggles: {},
		remoteWorkflowToggles: {},
		remoteConfigSettings: undefined,
		navigateToSettingsModelPicker: mocks.navigateToSettingsModelPicker,
		mcpServers: [],
		...mocks.cloudState,
	}),
}))

vi.mock("@/context/PlatformContext", () => ({
	usePlatform: () => ({ togglePlanActKeys: "Meta+Shift+a" }),
}))

vi.mock("@/hooks/useNormalizedApiConfiguration", () => ({
	useNormalizedApiConfiguration: () => ({
		selectedProvider: "anthropic",
		selectedModelId: "text-only-model",
		selectedModelInfo: { supportsImages: mocks.supportsImages },
	}),
}))

vi.mock("@/services/grpc-client", () => ({
	UiServiceClient: {
		subscribeToActiveEditorContext: vi.fn(() => vi.fn()),
	},
	FileServiceClient: {
		searchCommits: vi.fn(async () => ({ commits: [] })),
		searchFiles: vi.fn(async () => ({ results: [] })),
		getRelativePaths: vi.fn(async () => ({ paths: [] })),
		openImage: vi.fn(async () => ({})),
		openFile: vi.fn(async () => ({})),
	},
	StateServiceClient: {
		togglePlanActModeProto: vi.fn(async () => ({})),
	},
	ModelsServiceClient: {
		updateApiConfigurationProto: vi.fn(async () => ({})),
	},
}))

vi.mock("../cline-rules/ClineRulesToggleModal", () => ({ default: () => null }))
vi.mock("./ServersToggleModal", () => ({ default: () => null }))

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo="

function renderTextArea(
	selectedImages: string[] = [],
	extraProps: { stopButton?: ReactNode; composerActions?: ReactNode; inputValue?: string } = {},
) {
	const setSelectedImages = vi.fn()
	render(
		<ChatTextArea
			activeQuote={null}
			inputValue=""
			onSelectFilesAndImages={vi.fn()}
			onSend={vi.fn()}
			placeholderText="Type a message"
			selectedFiles={[]}
			selectedImages={selectedImages}
			sendingDisabled={false}
			setInputValue={vi.fn()}
			setSelectedFiles={vi.fn()}
			setSelectedImages={setSelectedImages}
			shouldDisableFilesAndImages={false}
			{...extraProps}
		/>,
	)
	return { textarea: screen.getByPlaceholderText("Type a message"), setSelectedImages }
}

function pasteImage(target: HTMLElement) {
	const file = new File(["png"], "screenshot.png", { type: "image/png" })
	return fireEvent.paste(target, {
		clipboardData: {
			items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
			getData: () => "",
		},
	})
}

describe("ChatTextArea model label", () => {
	beforeEach(() => {
		mocks.cloudState = {}
	})

	it("shows the local provider and model for a local task", () => {
		renderTextArea()
		expect(screen.getByTitle("Open API Settings")).toHaveTextContent("anthropic:text-only-model")
	})

	it("uses Ola's compact model picker and Agent/Plan without API settings", () => {
		mocks.cloudState = { opengatesAuthEnabled: true }
		renderTextArea()
		expect(screen.getByRole("button", { name: "Model" })).toBeVisible()
		expect(screen.queryByTitle("Open API Settings")).not.toBeInTheDocument()
		expect(screen.getByText("Agent")).toBeVisible()
		expect(screen.getByText("Plan")).toBeVisible()
	})

	it("puts Ola actions inside the composer card and swaps Send for Stop", () => {
		mocks.cloudState = { opengatesAuthEnabled: true }
		renderTextArea([], {
			composerActions: <button type="button">Retry</button>,
			stopButton: (
				<button aria-label="Stop" type="button">
					stop
				</button>
			),
		})
		const composer = screen.getByTestId("chat-composer")
		expect(composer).toHaveClass("ola-composer")
		expect(composer).toContainElement(screen.getByRole("button", { name: "Retry" }))
		expect(composer).toContainElement(screen.getByRole("button", { name: "Stop" }))
		expect(screen.queryByTestId("send-button")).not.toBeInTheDocument()
	})

	it.each([
		["a new task targets Cloud", { cloudSessionsEnabled: true, cloudTaskTarget: { target: "cloud" } }],
		["a cloud task is shown", { currentCloudTask: { sessionId: "ses-1", status: "running" } }],
	])("shows the cloud model when %s", (_case, cloudState) => {
		mocks.cloudState = { ...cloudState, cloudModelId: "anthropic/claude-sonnet-4.5" }
		renderTextArea()
		expect(screen.getByTitle("Open API Settings")).toHaveTextContent("cline:anthropic/claude-sonnet-4.5")
	})
})

describe("ChatTextArea draft height", () => {
	beforeEach(() => {
		mocks.supportsImages = true
		mocks.cloudState = {}
	})

	it.each([
		["empty Ola draft", true, "", 78, true],
		["short Ola draft", true, "Explain this file", 38, false],
		["multiline Ola draft", true, "First line\nSecond line", 58, false],
		["long Ola draft", true, Array(12).fill("Another line").join("\n"), 218, false],
		["non-Ola draft", false, "Explain this file", 78, false],
	] as const)("sizes an %s without reserving hidden hint space", (_label, ola, inputValue, height, showHint) => {
		mocks.cloudState = { opengatesAuthEnabled: ola }
		const scrollHeight = vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(function () {
			return this.value.split("\n").length * 20 + 18
		})
		try {
			const { textarea } = renderTextArea([], { inputValue })
			expect(textarea).toHaveStyle({ height: `${height}px` })
			const hint = screen.queryByText(/Type @ for context/)
			if (showHint) {
				expect(hint).toBeInTheDocument()
			} else {
				expect(hint).not.toBeInTheDocument()
			}
		} finally {
			scrollHeight.mockRestore()
		}
	})
})

describe("ChatTextArea Ola modes", () => {
	beforeEach(() => {
		mocks.cloudState = { opengatesAuthEnabled: true }
		vi.mocked(StateServiceClient.togglePlanActModeProto).mockClear()
	})

	it("shows the Opengates attribution below the composer", () => {
		renderTextArea()
		const footer = screen.getByTestId("ola-composer-footer")
		expect(footer).toHaveTextContent("From Opengates, a Theta company")
		expect(screen.getByTestId("chat-composer").nextElementSibling).toBe(footer)
	})

	it("offers Interactive, Plan, and Agent in that order", () => {
		renderTextArea()
		expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Interactive", "Plan", "Agent"])
		expect(screen.getByRole("radio", { name: "Agent" })).toHaveAttribute("aria-checked", "true")
	})

	it("shows Interactive as selected when Agent runs with Interactive enabled", () => {
		mocks.cloudState = { opengatesAuthEnabled: true, olaInteractive: true }
		renderTextArea()
		expect(screen.getByRole("radio", { name: "Interactive" })).toHaveAttribute("aria-checked", "true")
	})

	it.each([
		["Interactive", PlanActMode.ACT, true],
		["Plan", PlanActMode.PLAN, false],
	] as const)("requests %s mode", (label, mode, interactive) => {
		renderTextArea()
		fireEvent.click(screen.getByRole("radio", { name: label }))
		expect(StateServiceClient.togglePlanActModeProto).toHaveBeenCalledWith(expect.objectContaining({ mode, interactive }))
	})

	it("switches with arrow keys", () => {
		renderTextArea()
		fireEvent.keyDown(screen.getByRole("radiogroup", { name: "Mode" }), { key: "ArrowRight" })
		expect(StateServiceClient.togglePlanActModeProto).toHaveBeenCalledWith(
			expect.objectContaining({ mode: PlanActMode.ACT, interactive: true }),
		)
	})
})

describe("ChatTextArea image attachments vs. model capability", () => {
	beforeEach(() => {
		mocks.supportsImages = true
		mocks.cloudState = {}
		mocks.navigateToSettingsModelPicker.mockReset()
	})

	it("renders before optional cloud state has hydrated", () => {
		renderTextArea()

		expect(screen.getByPlaceholderText("Type a message")).toBeInTheDocument()
		expect(screen.getByTestId("mode-switch")).toHaveAttribute("aria-disabled", "false")
	})

	it("still takes the image attach path on paste for a text-only model, without a refusal message", () => {
		mocks.supportsImages = false
		const { textarea } = renderTextArea()

		const notCanceled = pasteImage(textarea)

		expect(notCanceled).toBe(false) // preventDefault: the paste was handled as an image, not as text
		expect(screen.queryByText(/ignored/)).not.toBeInTheDocument()
	})

	it("badges attached images and offers a model switch when the model is text-only", () => {
		mocks.supportsImages = false
		renderTextArea([PNG_DATA_URL, PNG_DATA_URL])

		const notice = screen.getByTestId("images-unsupported-notice")
		expect(notice).toHaveTextContent("text-only-model doesn't support images, so the 2 attached images will be ignored.")
		expect(screen.getAllByTestId("image-unsupported-badge")).toHaveLength(2)

		// A native button, so keyboard users get Enter/Space activation without extra handlers.
		const chooseModel = screen.getByRole("button", { name: "Choose an image-capable model" })
		expect(chooseModel.tagName).toBe("BUTTON")
		fireEvent.click(chooseModel)
		expect(mocks.navigateToSettingsModelPicker).toHaveBeenCalledWith({ targetSection: "api-config" })
	})

	it("uses singular wording for one image", () => {
		mocks.supportsImages = false
		renderTextArea([PNG_DATA_URL])

		expect(screen.getByTestId("images-unsupported-notice")).toHaveTextContent("the attached image will be ignored")
		expect(screen.getByTestId("images-unsupported-notice")).toHaveTextContent("or remove it.")
	})

	it("shows nothing extra when the model supports images", () => {
		renderTextArea([PNG_DATA_URL])

		expect(screen.queryByTestId("images-unsupported-notice")).not.toBeInTheDocument()
		expect(screen.queryByTestId("image-unsupported-badge")).not.toBeInTheDocument()
	})

	it("fails open when the model's image support is unknown", () => {
		mocks.supportsImages = undefined
		renderTextArea([PNG_DATA_URL])

		expect(screen.queryByTestId("images-unsupported-notice")).not.toBeInTheDocument()
	})

	it("shows nothing for a text-only model while no images are attached", () => {
		mocks.supportsImages = false
		renderTextArea()

		expect(screen.queryByTestId("images-unsupported-notice")).not.toBeInTheDocument()
	})
})
