import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FileTypeIcon, getFileType } from "./FileTypeIcon"

describe("FileTypeIcon", () => {
	it.each([
		["main.ts", "TS"],
		["server.py", "PY"],
		["styles.css", "#"],
		["App.CS", "C#"],
		["config.yaml", "YML"],
	])("shows a language mark for %s", (fileName, text) => {
		render(<FileTypeIcon fileName={fileName} />)
		expect(screen.getByTestId("file-type-icon")).toHaveTextContent(text)
	})

	it("uses distinct icons for React, JSON, special names, and unknown files", () => {
		const react = getFileType("main.tsx")
		const json = getFileType("tsconfig.json")
		const docker = getFileType("Dockerfile")
		const unknown = getFileType("notes.unknownext")
		const noExtension = getFileType("LICENSE")
		expect(react.kind).toBe("icon")
		expect(json.kind).toBe("icon")
		expect(docker.kind).toBe("icon")
		expect(new Set([react, json, docker, unknown].map((type) => (type.kind === "icon" ? type.Icon : type.text))).size).toBe(4)
		expect(noExtension).toEqual(unknown)
	})

	it("is hidden from assistive technology", () => {
		render(<FileTypeIcon fileName="main.go" />)
		expect(screen.getByTestId("file-type-icon")).toHaveAttribute("aria-hidden", "true")
	})
})
