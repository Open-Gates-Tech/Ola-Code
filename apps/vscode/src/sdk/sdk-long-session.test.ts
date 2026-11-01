import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { estimateRequestInputTokens, type MessageWithMetadata } from "@cline/shared"
import { describe, expect, it, vi } from "vitest"
import { getOpengatesModelInfo, OPENGATES_MAX_INPUT_TOKENS } from "@/shared/opengates-models"
import type { ContextPipelinePrepareTurn } from "../../node_modules/@cline/core/dist/extensions/context/compaction"
import type { SessionCompactionState } from "../../node_modules/@cline/core/dist/session/models/session-compaction"
import type { SessionPersistenceAdapter } from "../../node_modules/@cline/core/dist/types/session"

// Exercise real SDK source, not the extension's @cline/core test stub. Use the
// built declarations to avoid pulling SDK implementation into extension rootDir.
const sdkSource = new URL("../../../../sdk/packages/core/src", import.meta.url).href
const { createCompactionStateAwarePrepareTurn, createContextCompactionPrepareTurn } = (await import(
	`${sdkSource}/extensions/context/compaction.ts`
)) as typeof import("../../node_modules/@cline/core/dist/extensions/context/compaction")
const { COMPACTION_TRIGGER_RATIO } = (await import(
	`${sdkSource}/extensions/context/compaction-shared.ts`
)) as typeof import("../../node_modules/@cline/core/dist/extensions/context/compaction-shared")
const { projectSessionCompactionState } = (await import(
	`${sdkSource}/session/models/session-compaction.ts`
)) as typeof import("../../node_modules/@cline/core/dist/session/models/session-compaction")
const { SessionManifestStore } = (await import(
	`${sdkSource}/session/stores/session-manifest-store.ts`
)) as typeof import("../../node_modules/@cline/core/dist/session/stores/session-manifest-store")

describe("Ola sustained working context", () => {
	it("compacts a tool-rich 60-turn transcript repeatedly and restarts from durable sidecars", async () => {
		const directory = mkdtempSync(path.join(process.cwd(), ".long-session-"))
		const transcriptPath = path.join(directory, "canonical.json")
		const sessionId = "ola-long-session"
		const modelId = "ola-code-fast"
		const systemPrompt = "Retain the task instructions and never repeat an approved edit."
		const tools = [{ name: "apply_patch", inputSchema: { type: "object" } }]
		const adapter: SessionPersistenceAdapter = {
			ensureSessionsDir: () => directory,
			upsertSession: vi.fn(),
			getSession: vi.fn(),
			listSessions: vi.fn(),
			updateSession: vi.fn(),
			deleteSession: vi.fn(),
			enqueueSpawnRequest: vi.fn(),
			claimSpawnRequest: vi.fn(),
		}
		let store = new SessionManifestStore(adapter)
		let state: SessionCompactionState | undefined
		let canonical: MessageWithMetadata[] = []
		let working: MessageWithMetadata[] = []
		const crossings: number[] = []
		let completedTurns = 0
		let restarts = 0
		const count = (messages: MessageWithMetadata[]) => estimateRequestInputTokens({ messages, systemPrompt, tools })
		const assertPairs = (messages: MessageWithMetadata[]) => {
			const calls: string[] = []
			const results: string[] = []
			for (const message of messages) {
				if (!Array.isArray(message.content)) continue
				for (const block of message.content) {
					if (block.type === "tool_use") calls.push(block.id)
					if (block.type === "tool_result") results.push(block.tool_use_id)
				}
			}
			expect(calls.sort()).toEqual(results.sort())
		}
		const makePipeline = (): ContextPipelinePrepareTurn => {
			const compact = createContextCompactionPrepareTurn({
				providerId: "openai-compatible",
				modelId,
				compaction: { enabled: true, strategy: "basic" },
			})
			expect(compact).toBeDefined()
			if (!compact) throw new Error("Automatic compaction must be enabled")
			return createCompactionStateAwarePrepareTurn({
				compact: async (context) => {
					const before = count(context.apiMessages)
					const result = await compact(context)
					if (result) {
						expect(before).toBeGreaterThanOrEqual(OPENGATES_MAX_INPUT_TOKENS * COMPACTION_TRIGGER_RATIO)
						expect(count(result.messages)).toBeLessThan(OPENGATES_MAX_INPUT_TOKENS * COMPACTION_TRIGGER_RATIO)
						crossings.push(completedTurns)
					}
					return result
				},
				getState: () => state,
				saveState: async (next, source) => {
					expect(source).toEqual(canonical)
					await store.persistSessionCompactionState(sessionId, next)
					state = next
				},
			})
		}
		let prepare = makePipeline()
		const context = () => ({
			agentId: "ola-test",
			conversationId: sessionId,
			parentAgentId: null,
			iteration: completedTurns,
			messages: canonical,
			apiMessages: canonical,
			abortSignal: new AbortController().signal,
			systemPrompt,
			tools,
			model: { id: modelId, provider: "openai-compatible", info: getOpengatesModelInfo(modelId) },
		})
		try {
			for (let turn = 1; turn <= 60; turn++) {
				const edit = `edit-${turn}`
				const read = `read-${turn}`
				canonical.push(
					{
						id: `prompt-${turn}`,
						role: "user",
						content: `<user_input>Implement step ${turn}; preserve approved edits.</user_input>`,
					},
					{
						id: `calls-${turn}`,
						role: "assistant",
						content: [
							{ type: "tool_use", id: read, name: "read_files", input: { files: [`step-${turn}.ts`] } },
							{ type: "tool_use", id: edit, name: "apply_patch", input: { patch: `Update step-${turn}.ts` } },
						],
						metadata: { approval: { toolCallId: edit, approved: true } },
					},
					{
						id: `results-${turn}`,
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: read,
								name: "read_files",
								content: `file-${turn}\n${"source context ".repeat(2400)}`,
							},
							{
								type: "tool_result",
								tool_use_id: edit,
								name: "apply_patch",
								content: `Updated step-${turn}.ts successfully`,
							},
						],
						metadata: { edit: { path: `step-${turn}.ts`, applied: true } },
					},
					{ id: `reply-${turn}`, role: "assistant", content: `Step ${turn} edit completed.` },
				)
				completedTurns++
				writeFileSync(transcriptPath, JSON.stringify(canonical))
				const priorState = state
				const result = await prepare(context())
				working = result?.messages ?? canonical
				assertPairs(working)
				if (state !== priorState) {
					expect(JSON.stringify(working)).toContain(`Updated step-${turn}.ts successfully`)
					expect(working.find((message) => message.id === `calls-${turn}`)?.metadata).toMatchObject({
						approval: { toolCallId: edit, approved: true },
					})
					expect(working.find((message) => message.id === `results-${turn}`)?.metadata).toMatchObject({
						edit: { path: `step-${turn}.ts`, applied: true },
					})
					// Restart both the artifact reader and prepareTurn closure; no
					// working-context object survives this persistence boundary.
					store = new SessionManifestStore(adapter)
					canonical = JSON.parse(readFileSync(transcriptPath, "utf8"))
					state = await store.readSessionCompactionState(sessionId)
					expect(state).toBeDefined()
					if (!state) throw new Error("Persisted compaction state is missing")
					expect(projectSessionCompactionState(state, canonical)).toEqual(working)
					prepare = makePipeline()
					expect((await prepare(context()))?.messages).toEqual(working)
					restarts++
				}
			}
			expect(completedTurns).toBe(60)
			expect(canonical).toHaveLength(240)
			assertPairs(canonical)
			for (let turn = 1; turn <= 60; turn++) {
				expect(canonical[(turn - 1) * 4 + 1].content).toMatchObject([
					{ type: "tool_use", id: `read-${turn}` },
					{ type: "tool_use", id: `edit-${turn}` },
				])
				expect(canonical[(turn - 1) * 4 + 2].content).toMatchObject([
					{ type: "tool_result", tool_use_id: `read-${turn}` },
					{ type: "tool_result", tool_use_id: `edit-${turn}` },
				])
			}
			expect(crossings.length).toBeGreaterThanOrEqual(2)
			expect(restarts).toBe(crossings.length)
			expect(JSON.parse(readFileSync(transcriptPath, "utf8"))).toEqual(canonical)
			// An outstanding approval is canonical tail, not a completed tool
			// result to invent or an edit to execute again during resume.
			const pending: MessageWithMetadata = {
				id: "pending-edit",
				role: "assistant",
				content: [{ type: "tool_use", id: "approval-61", name: "apply_patch", input: { patch: "pending edit" } }],
				metadata: { approval: { toolCallId: "approval-61", status: "pending" } },
			}
			canonical.push(pending)
			writeFileSync(transcriptPath, JSON.stringify(canonical))
			store = new SessionManifestStore(adapter)
			state = await store.readSessionCompactionState(sessionId)
			if (!state) throw new Error("Persisted compaction state is missing")
			const resumed = projectSessionCompactionState(state, JSON.parse(readFileSync(transcriptPath, "utf8")))
			if (!resumed) throw new Error("Compaction state must project onto the canonical transcript")
			expect(resumed.at(-1)).toEqual(pending)
			assertPairs(resumed.slice(0, -1))
			expect(resumed.find((message) => message.id === "calls-60")?.metadata).toMatchObject({
				approval: { toolCallId: "edit-60", approved: true },
			})
			expect(resumed.find((message) => message.id === "results-60")?.metadata).toMatchObject({
				edit: { path: "step-60.ts", applied: true },
			})
			expect(JSON.stringify(resumed)).toContain("Updated step-60.ts successfully")
			expect(adapter.updateSession).not.toHaveBeenCalled()
			process.stdout.write(
				`Ola sustained-session: 60 turns, ${crossings.length} threshold compactions at turns ${crossings.join(",")}, ${restarts} sidecar restarts\n`,
			)
		} finally {
			rmSync(directory, { recursive: true, force: true })
		}
	})
})
