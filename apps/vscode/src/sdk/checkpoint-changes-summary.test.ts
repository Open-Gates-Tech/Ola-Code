import { describe, expect, it } from "vitest"
import { summarizeContentDiffs } from "./checkpoint-changes-summary"

describe("summarizeContentDiffs", () => {
	it("counts changed files and added/removed lines", () => {
		expect(
			summarizeContentDiffs([
				{ leftContent: "a\nb\nc\n", rightContent: "a\nB\nc\nd\n" },
				{ leftContent: "", rightContent: "new\nfile\n" },
				{ leftContent: "gone\n", rightContent: "" },
			]),
		).toEqual({ files: 3, additions: 4, deletions: 2 })
	})

	it("returns zeros when nothing changed", () => {
		expect(summarizeContentDiffs([])).toEqual({ files: 0, additions: 0, deletions: 0 })
	})
})
