import { beforeEach, describe, expect, it, vi } from "vitest"
import { getActiveEditor } from "@/hosts/vscode/hostbridge/window/getActiveEditor"

const mocks = vi.hoisted(() => ({
	editor: undefined as
		| {
				document: {
					uri: { scheme: string; fsPath: string; toString: () => string }
					version: number
					languageId: string
					lineAt: (line: number) => { text: string }
					getText: ReturnType<typeof vi.fn>
				}
				selection: {
					isEmpty: boolean
					start: { line: number; character: number }
					end: { line: number; character: number }
				}
		  }
		| undefined,
}))

vi.mock("vscode", () => ({
	window: {
		get activeTextEditor() {
			return mocks.editor
		},
	},
	Range: class {
		constructor(
			public startLine: number,
			public startCharacter: number,
			public endLine: number,
			public endCharacter: number,
		) {}
	},
}))

describe("active editor snapshot", () => {
	beforeEach(() => {
		mocks.editor = {
			document: {
				uri: { scheme: "file", fsPath: "C:\\repo\\main.tsx", toString: () => "file:///C:/repo/main.tsx" },
				version: 1,
				languageId: "typescriptreact",
				lineAt: () => ({ text: "selected code" }),
				getText: vi.fn(() => "selected code"),
			},
			selection: { isEmpty: false, start: { line: 7, character: 3 }, end: { line: 12, character: 0 } },
		}
	})

	it("reports 1-based selected lines without reading contents for suggestions", async () => {
		expect(await getActiveEditor({})).toMatchObject({ startLine: 8, endLine: 12, languageId: "typescriptreact" })
		expect(mocks.editor?.document.getText).not.toHaveBeenCalled()
	})

	it("reads the selected lines only when requested", async () => {
		const result = await getActiveEditor({ includeSelection: true })
		expect(result.selectedText).toBe("selected code")
		expect(mocks.editor?.document.getText).toHaveBeenCalledWith(expect.objectContaining({ startLine: 7, endLine: 11 }))
	})

	it("does not offer sensitive files, untitled buffers, or a missing editor", async () => {
		if (!mocks.editor) throw new Error("Expected a test editor")
		mocks.editor.document.uri.fsPath = "C:\\repo\\.env"
		expect((await getActiveEditor({ includeSelection: true })).contextId).toBeUndefined()
		expect(mocks.editor.document.getText).not.toHaveBeenCalled()
		mocks.editor.document.uri.scheme = "untitled"
		expect((await getActiveEditor({})).contextId).toBeUndefined()
		mocks.editor = undefined
		expect((await getActiveEditor({})).contextId).toBeUndefined()
	})

	it("omits line numbers for a cursor and changes identity when the document changes", async () => {
		if (!mocks.editor) throw new Error("Expected a test editor")
		mocks.editor.selection.isEmpty = true
		const before = await getActiveEditor({})
		expect(before.startLine).toBeUndefined()
		mocks.editor.document.version++
		expect((await getActiveEditor({})).contextId).not.toBe(before.contextId)
	})
})
