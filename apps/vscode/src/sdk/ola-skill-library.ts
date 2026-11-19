import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { z } from "zod"

/**
 * Ola's skill library in Ola Code.
 *
 * OlaAI-Server keeps one checked skill library per workspace (a person's own, or their organisation's).
 * Ola Code mirrors the skills marked for code into its global skills folder, where its agent already
 * finds them. A manifest records which folders Ola wrote, so only those are ever changed or removed:
 * a skill a developer added themselves is never touched, and keeps its name if the library has the same one.
 */

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SKILLS = 200
const MAX_TOTAL_BYTES = 64 * 1024 * 1024

const fileSchema = z.object({ path: z.string().min(1).max(200), contents: z.string() })
const skillSchema = z.object({
	id: z.string().min(1),
	name: z.string().max(64).regex(SKILL_NAME),
	description: z.string(),
	version: z.number().int(),
	hash: z.string().min(1),
	body: z.string().min(1),
	files: z.array(fileSchema).max(200),
})
const librarySchema = z.object({ workspace: z.string(), skills: z.array(skillSchema).max(MAX_SKILLS) })
const manifestSchema = z.object({
	version: z.literal(1),
	workspace: z.string(),
	skills: z.record(z.string(), z.string()),
})

export type OlaLibrarySkill = z.infer<typeof skillSchema>
type Manifest = z.infer<typeof manifestSchema>

export interface OlaSkillPaths {
	/** The global skills folder Ola Code's agent reads (`~/.ola-code/skills`). */
	skillsDir: string
	/** A private folder on the same disk for the manifest and for staging writes (`~/.ola-code/data`). */
	dataDir: string
}

export interface OlaSkillSyncResult {
	workspace: string
	/** Every library skill now in Ola Code, written or already current. */
	installed: string[]
	/** Library skills left out because the developer has their own skill of that name. */
	skipped: string[]
	/** Skills Ola had written before that the library no longer has, now removed. */
	removed: string[]
}

export class OlaSkillLibraryError extends Error {
	constructor(
		message: string,
		readonly code: "workspace_forbidden" | "unavailable" | "invalid",
	) {
		super(message)
	}
}

const manifestPath = (paths: OlaSkillPaths) => path.join(paths.dataDir, "ola-skill-library.json")

async function readManifest(paths: OlaSkillPaths): Promise<Manifest> {
	try {
		return manifestSchema.parse(JSON.parse(await fs.readFile(manifestPath(paths), "utf8")))
	} catch {
		return { version: 1, workspace: "", skills: {} }
	}
}

async function writeManifest(paths: OlaSkillPaths, manifest: Manifest): Promise<void> {
	await fs.mkdir(paths.dataDir, { recursive: true })
	const staged = `${manifestPath(paths)}.${randomUUID()}.tmp`
	await fs.writeFile(staged, JSON.stringify(manifest, null, "\t"), "utf8")
	await fs.rename(staged, manifestPath(paths))
}

/** A skill file's place inside its folder, or undefined when the path could leave it. */
export function safeSkillFilePath(root: string, relative: string): string | undefined {
	const normal = relative.replaceAll("\\", "/")
	const parts = normal.split("/")
	if (
		normal.startsWith("/") ||
		/^[a-zA-Z]:/.test(normal) ||
		parts.some((part) => part === "" || part === "." || part === ".." || part.includes("\0")) ||
		normal.toLowerCase() === "skill.md"
	) {
		return undefined
	}
	const target = path.resolve(root, ...parts)
	return target.startsWith(path.resolve(root) + path.sep) ? target : undefined
}

async function exists(target: string): Promise<boolean> {
	return fs
		.lstat(target)
		.then(() => true)
		.catch(() => false)
}

async function writeSkill(paths: OlaSkillPaths, skill: OlaLibrarySkill): Promise<void> {
	// Staged beside the manifest so the agent never reads a half-written skill, then moved in whole.
	const staging = path.join(paths.dataDir, "ola-skill-staging", `${skill.name}-${randomUUID()}`)
	try {
		await fs.mkdir(staging, { recursive: true })
		await fs.writeFile(path.join(staging, "SKILL.md"), skill.body, "utf8")
		for (const file of skill.files) {
			const target = safeSkillFilePath(staging, file.path)
			if (!target) continue
			await fs.mkdir(path.dirname(target), { recursive: true })
			await fs.writeFile(target, file.contents, "utf8")
		}
		const destination = path.join(paths.skillsDir, skill.name)
		await fs.rm(destination, { recursive: true, force: true })
		await fs.rename(staging, destination)
	} finally {
		await fs.rm(staging, { recursive: true, force: true })
	}
}

/** Parses the server's reply, refusing anything outside the library's limits. */
export function parseOlaSkillLibrary(value: unknown): { workspace: string; skills: OlaLibrarySkill[] } {
	const parsed = librarySchema.safeParse(value)
	if (!parsed.success) {
		throw new OlaSkillLibraryError("Ola sent a skill library Ola Code couldn't read.", "invalid")
	}
	let total = 0
	const seen = new Set<string>()
	const skills = parsed.data.skills.filter((skill) => {
		total += skill.body.length + skill.files.reduce((sum, file) => sum + file.contents.length, 0)
		if (seen.has(skill.name)) return false
		seen.add(skill.name)
		return true
	})
	if (total > MAX_TOTAL_BYTES) {
		throw new OlaSkillLibraryError("The skill library is larger than Ola Code accepts.", "invalid")
	}
	return { workspace: parsed.data.workspace, skills }
}

/** Fetches the workspace's code skills from OlaAI-Server. An empty workspace means the person's own library. */
export async function fetchOlaSkillLibrary(fetcher: typeof globalThis.fetch, baseUrl: string, workspace: string) {
	const response = await fetcher(`${baseUrl}/skills/code`, {
		headers: workspace ? { "X-Ola-Workspace": workspace } : undefined,
		signal: AbortSignal.timeout(30_000),
	})
	if (response.status === 403 || response.status === 400) {
		await response.body?.cancel()
		throw new OlaSkillLibraryError("You're no longer a member of that workspace.", "workspace_forbidden")
	}
	if (!response.ok) {
		await response.body?.cancel()
		throw new OlaSkillLibraryError(`Ola's skill library is unavailable (HTTP ${response.status}).`, "unavailable")
	}
	return parseOlaSkillLibrary(await response.json())
}

/** Makes Ola Code's skills folder match the library, changing only the folders Ola wrote. */
export async function applyOlaSkillLibrary(
	paths: OlaSkillPaths,
	library: { workspace: string; skills: OlaLibrarySkill[] },
): Promise<OlaSkillSyncResult> {
	await fs.mkdir(paths.skillsDir, { recursive: true })
	const manifest = await readManifest(paths)
	const next: Manifest = { version: 1, workspace: library.workspace, skills: {} }
	const result: OlaSkillSyncResult = { workspace: library.workspace, installed: [], skipped: [], removed: [] }
	try {
		for (const skill of library.skills) {
			const ours = skill.name in manifest.skills
			const folder = path.join(paths.skillsDir, skill.name)
			if (!ours && (await exists(folder))) {
				result.skipped.push(skill.name)
				continue
			}
			if (!ours || manifest.skills[skill.name] !== skill.hash || !(await exists(path.join(folder, "SKILL.md")))) {
				await writeSkill(paths, skill)
			}
			next.skills[skill.name] = skill.hash
			result.installed.push(skill.name)
		}
		for (const name of Object.keys(manifest.skills)) {
			if (name in next.skills || !SKILL_NAME.test(name)) continue
			await fs.rm(path.join(paths.skillsDir, name), { recursive: true, force: true })
			result.removed.push(name)
		}
	} catch (error) {
		// Record what was written so far, so a later sync still knows which folders are Ola's.
		for (const name of Object.keys(manifest.skills)) {
			if (!(name in next.skills) && !result.removed.includes(name)) next.skills[name] = manifest.skills[name]
		}
		await writeManifest(paths, next)
		throw error
	}
	await writeManifest(paths, next)
	return result
}

/** Removes every skill Ola wrote, as on sign-out. A developer's own skills stay. */
export async function clearOlaSkillLibrary(paths: OlaSkillPaths): Promise<string[]> {
	const manifest = await readManifest(paths)
	const removed: string[] = []
	for (const name of Object.keys(manifest.skills)) {
		if (!SKILL_NAME.test(name)) continue
		await fs.rm(path.join(paths.skillsDir, name), { recursive: true, force: true })
		removed.push(name)
	}
	await fs.rm(manifestPath(paths), { force: true })
	return removed
}
