import { describe, expect, it } from "vitest"
import { canSuggestEditorFile } from "@/shared/active-editor-context"

describe("active editor file suggestions", () => {
	it.each([
		"C:\\repo\\.env",
		"/repo/.env.local",
		"/repo/secret.key",
		"/repo/id_rsa",
		"/repo/credentials.json",
	])("excludes sensitive file %s", (file) => expect(canSuggestEditorFile(file)).toBe(false))
	it.each([
		"C:\\repo\\main.tsx",
		"/repo/readme.md",
		"/repo/package.json",
		"/repo/file with spaces.ts",
	])("allows source file %s", (file) => expect(canSuggestEditorFile(file)).toBe(true))
})
