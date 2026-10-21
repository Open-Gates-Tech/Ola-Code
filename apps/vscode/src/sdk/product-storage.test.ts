import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveClineDataDir, resolveClineDir, setClineDir } from "@cline/shared/storage"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getSharedMcpSettingsPath } from "@/hosts/vscode/mcp-settings-legacy-migration"
import { productDocumentsDirectory, resolveProductHomeDir } from "@/shared/storage/product-paths"
import { createStorageContext, resolveDataDirFromEnv } from "@/shared/storage/storage-context"

describe("Ola product storage isolation", () => {
	let home: string
	let previousSdkHome: string

	beforeEach(() => {
		previousSdkHome = resolveClineDir()
		home = fs.mkdtempSync(path.join(os.tmpdir(), "ola-storage-"))
		vi.spyOn(os, "homedir").mockReturnValue(home)
		vi.stubEnv("CLINE_DIR", undefined)
		vi.stubEnv("CLINE_DATA_DIR", undefined)
		vi.stubEnv("CLINE_MCP_SETTINGS_PATH", undefined)
	})

	afterEach(() => {
		setClineDir(previousSdkHome)
		vi.restoreAllMocks()
		vi.unstubAllEnvs()
		fs.rmSync(home, { recursive: true, force: true })
	})

	it("keeps host, SDK and MCP data together without reading or modifying Cline's store", () => {
		const clineData = path.join(home, ".cline", "data")
		fs.mkdirSync(clineData, { recursive: true })
		const sentinel = path.join(clineData, "globalState.json")
		fs.writeFileSync(sentinel, '{"clineOnly":true}')

		// Mirror activation's module-local SDK home configuration.
		setClineDir(resolveProductHomeDir())
		const storage = createStorageContext({ workspacePath: home })
		const expected = path.join(home, ".ola-code", "data")
		expect(storage.dataDir).toBe(expected)
		expect(resolveDataDirFromEnv()).toBe(expected)
		expect(resolveClineDataDir()).toBe(expected)
		expect(getSharedMcpSettingsPath(storage)).toBe(path.join(expected, "settings", "cline_mcp_settings.json"))
		expect(storage.globalState.get("clineOnly")).toBeUndefined()
		expect(fs.readFileSync(sentinel, "utf8")).toBe('{"clineOnly":true}')
		expect(process.env.CLINE_DIR).toBeUndefined()
		expect(process.env.CLINE_DATA_DIR).toBeUndefined()
		expect(productDocumentsDirectory).toBe("Ola Code")
	})

	it("preserves explicit development overrides in both host and SDK", () => {
		const customHome = path.join(home, "custom")
		vi.stubEnv("CLINE_DIR", customHome)
		setClineDir(resolveProductHomeDir())
		expect(resolveDataDirFromEnv()).toBe(path.join(customHome, "data"))
		expect(resolveClineDataDir()).toBe(resolveDataDirFromEnv())

		vi.stubEnv("CLINE_DATA_DIR", path.join(home, "custom-data"))
		expect(resolveDataDirFromEnv()).toBe(path.join(home, "custom-data"))
		expect(resolveClineDataDir()).toBe(resolveDataDirFromEnv())
	})
})
