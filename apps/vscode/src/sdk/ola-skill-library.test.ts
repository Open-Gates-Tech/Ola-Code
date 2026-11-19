import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	applyOlaSkillLibrary,
	clearOlaSkillLibrary,
	fetchOlaSkillLibrary,
	type OlaLibrarySkill,
	type OlaSkillPaths,
	parseOlaSkillLibrary,
	safeSkillFilePath,
} from "./ola-skill-library"

const skill = (name: string, hash = "h1", files: OlaLibrarySkill["files"] = []): OlaLibrarySkill => ({
	id: `id-${name}`,
	name,
	description: `Does ${name}.`,
	version: 1,
	hash,
	body: `---\nname: ${name}\ndescription: Does ${name}.\n---\n\nSteps for ${name} (${hash}).`,
	files,
})

let root: string
let paths: OlaSkillPaths
const read = (...parts: string[]) => fs.readFile(path.join(paths.skillsDir, ...parts), "utf8")
const present = (...parts: string[]) =>
	fs
		.stat(path.join(paths.skillsDir, ...parts))
		.then(() => true)
		.catch(() => false)

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "ola-skills-"))
	paths = { skillsDir: path.join(root, "skills"), dataDir: path.join(root, "data") }
})
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true })
})

describe("Ola's skill library in Ola Code", () => {
	it("writes library skills with their files, updates changed ones and removes ones the library dropped", async () => {
		const first = await applyOlaSkillLibrary(paths, {
			workspace: "org1",
			skills: [
				skill("release-steps", "h1", [{ path: "reference/checklist.md", contents: "- tag" }]),
				skill("review-style"),
			],
		})
		expect(first.installed).toEqual(["release-steps", "review-style"])
		expect(await read("release-steps", "reference", "checklist.md")).toBe("- tag")
		expect(await read("review-style", "SKILL.md")).toContain("name: review-style")

		const second = await applyOlaSkillLibrary(paths, { workspace: "org1", skills: [skill("release-steps", "h2")] })
		expect(second.removed).toEqual(["review-style"])
		expect(await present("review-style")).toBe(false)
		expect(await read("release-steps", "SKILL.md")).toContain("(h2)")
		// The changed skill arrives whole: files it no longer has are gone.
		expect(await present("release-steps", "reference", "checklist.md")).toBe(false)
		expect(await fs.readdir(path.join(paths.dataDir, "ola-skill-staging"))).toEqual([])
	})

	it("never touches a developer's own skill, even one with a library skill's name", async () => {
		await fs.mkdir(path.join(paths.skillsDir, "my-flow"), { recursive: true })
		await fs.writeFile(path.join(paths.skillsDir, "my-flow", "SKILL.md"), "mine")

		const result = await applyOlaSkillLibrary(paths, { workspace: "", skills: [skill("my-flow"), skill("team-flow")] })
		expect(result.skipped).toEqual(["my-flow"])
		expect(await read("my-flow", "SKILL.md")).toBe("mine")

		await applyOlaSkillLibrary(paths, { workspace: "", skills: [] })
		expect(await read("my-flow", "SKILL.md")).toBe("mine")
		expect(await present("team-flow")).toBe(false)

		await applyOlaSkillLibrary(paths, { workspace: "", skills: [skill("team-flow")] })
		expect(await clearOlaSkillLibrary(paths)).toEqual(["team-flow"])
		expect(await present("team-flow")).toBe(false)
		expect(await read("my-flow", "SKILL.md")).toBe("mine")
	})

	it("keeps skill files inside the skill's folder", () => {
		const base = path.join(root, "s")
		expect(safeSkillFilePath(base, "reference/a.md")).toBe(path.join(base, "reference", "a.md"))
		for (const bad of ["../x.md", "a/../../x", "/etc/passwd", "C:/x.md", "C:\\x.md", "a//b", "SKILL.md", "./a"]) {
			expect(safeSkillFilePath(base, bad)).toBeUndefined()
		}
	})

	it("refuses replies with unsafe skill names", () => {
		expect(() => parseOlaSkillLibrary({ workspace: "", skills: [{ ...skill("x"), name: "../../escape" }] })).toThrow()
		expect(parseOlaSkillLibrary({ workspace: "", skills: [skill("a"), skill("a", "h2")] }).skills).toHaveLength(1)
	})

	it("asks for the chosen workspace and reports a lost membership", async () => {
		const seen: Headers[] = []
		const fetcher = (async (_url: string, init?: RequestInit) => {
			seen.push(new Headers(init?.headers))
			return new Response(JSON.stringify({ workspace: "org1", skills: [skill("a")] }), { status: 200 })
		}) as unknown as typeof fetch
		const library = await fetchOlaSkillLibrary(fetcher, "https://api.example/v1", "org1")
		expect(library.skills.map((s) => s.name)).toEqual(["a"])
		expect(seen[0].get("X-Ola-Workspace")).toBe("org1")

		const forbidden = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch
		await expect(fetchOlaSkillLibrary(forbidden, "https://api.example/v1", "org2")).rejects.toMatchObject({
			code: "workspace_forbidden",
		})
	})
})
