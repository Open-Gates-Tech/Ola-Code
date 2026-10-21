import { createHash, randomUUID } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { Agent, createTool } from "@cline/agents"
import { z } from "zod"
import { EvalBudget, usageSchema } from "./ola-eval-budget"

const modelSchema = z.object({
	alias: z.string(),
	upstream: z.string(),
	base_url: z.string().url(),
	key_env: z.string(),
	context_tokens: z.number().int().positive(),
	pricing: z.object({
		version: z.string(),
		input_nusd: z.number().int().positive(),
		cached_nusd: z.number().int().positive(),
		cache_write_nusd: z.number().int().positive(),
		output_nusd: z.number().int().positive(),
	}),
})
const wireUsageSchema = z.object({
	prompt_tokens: z.number().int().nonnegative(),
	completion_tokens: z.number().int().nonnegative(),
	prompt_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative().optional() }).nullish(),
})
const plans = ["free", "pro"] as const
const workflows = ["bugfix", "feature", "research"] as const
type Workflow = (typeof workflows)[number]
const grants = { free: 200_000_000, pro: 5_000_000_000, ultra: 15_000_000_000, ultra_plus: 30_000_000_000 }

function fixture(workflow: Workflow, variant: number) {
	const offset = variant + 1
	if (workflow === "bugfix")
		return {
			prompt: "Fix uniqueSorted in index.mjs. It must remove duplicate numbers and sort numerically ascending. Keep the exported name. Run the tests and submit.",
			source: "export function uniqueSorted(values) { return [...new Set(values)].sort(); }\n",
			tests: `import { uniqueSorted } from "/workspace/index.mjs";
import assert from "node:assert/strict";
assert.deepEqual(uniqueSorted([10,2,2,-${offset},0]),[-${offset},0,2,10]);
assert.deepEqual(uniqueSorted([]),[]);
assert.deepEqual(uniqueSorted([3,3]),[3]);`,
		}
	if (workflow === "feature")
		return {
			prompt: "Implement chunk(items, size) in index.mjs. Return sequential arrays of at most size without mutating input. Throw RangeError for nonpositive or noninteger sizes. Run tests and submit.",
			source: "export function chunk(items, size) { throw new Error('not implemented'); }\n",
			tests: `import { chunk } from "/workspace/index.mjs";
import assert from "node:assert/strict";
const original=[1,2,3,4,${offset + 5}];
assert.deepEqual(chunk(original,2),[[1,2],[3,4],[${offset + 5}]]);
assert.deepEqual(original,[1,2,3,4,${offset + 5}]);
assert.deepEqual(chunk([],2),[]);
for(const n of [0,-1,1.5,NaN]) assert.throws(()=>chunk([1],n),RangeError);`,
		}
	return {
		prompt: "Use fetch_reference to research example.com. Write summary.md citing https://example.com and explaining its documentation-example purpose. Implement exampleProject() in index.mjs returning { title: 'Example Domain', source: 'https://example.com', purpose: 'documentation examples' }. Run tests and submit.",
		source: "export function exampleProject() { return {}; }\n",
		tests: `import { exampleProject } from "/workspace/index.mjs";
import assert from "node:assert/strict";
assert.deepEqual(exampleProject(),{title:"Example Domain",source:"https://example.com",purpose:"documentation examples"});`,
	}
}

async function executeTests(workspace: string, testPath: string): Promise<{ success: boolean; output: string }> {
	const container = `ola-eval-test-${randomUUID()}`
	const proc = Bun.spawn(
		[
			"docker",
			"run",
			"--rm",
			"--name",
			container,
			"--network",
			"none",
			"--read-only",
			"--cap-drop",
			"ALL",
			"--security-opt",
			"no-new-privileges",
			"--pids-limit",
			"64",
			"--memory",
			"128m",
			"--cpus",
			"0.5",
			"--user",
			"65534:65534",
			"--mount",
			`type=bind,source=${workspace},target=/workspace,readonly`,
			"--mount",
			`type=bind,source=${testPath},target=/verification.mjs,readonly`,
			"node:22-alpine",
			"node",
			"/verification.mjs",
		],
		{ stdout: "pipe", stderr: "pipe" },
	)
	const timeout = setTimeout(() => proc.kill(), 30000)
	try {
		const [stdout, stderr, status] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		])
		return { success: status === 0, output: (stdout + stderr).slice(0, 6000) }
	} finally {
		clearTimeout(timeout)
		// Killing the Docker client does not necessarily stop its container.
		if (proc.exitCode !== 0) {
			await Bun.spawn(["docker", "rm", "-f", container], { stdout: "ignore", stderr: "ignore" }).exited
		}
	}
}

export async function runEvaluation(catalogPath: string, outputRoot: string): Promise<void> {
	const root = resolve(outputRoot)
	mkdirSync(root, { recursive: true })
	const lockPath = join(root, "experiment.lock")
	const lock = openSync(lockPath, "wx", 0o600)
	let server: ReturnType<typeof Bun.serve> | undefined
	try {
		const catalog = z.object({ ROUTING_CATALOG: z.array(modelSchema) }).parse(JSON.parse(readFileSync(catalogPath, "utf8")))
		const model = catalog.ROUTING_CATALOG.find((entry) => entry.upstream === "gpt-4.1-mini-ola")
		if (!model || !model.pricing.version.includes("gpt-4.1-mini")) {
			throw new Error("Evaluation requires the price-checked Global GPT-4.1-mini deployment")
		}
		const upstreamURL = new URL(`${model.base_url.replace(/\/$/, "")}/chat/completions`)
		if (upstreamURL.protocol !== "https:" || !upstreamURL.hostname.endsWith(".openai.azure.com")) {
			throw new Error("Evaluation upstream must be the configured Azure HTTPS endpoint")
		}
		const key = process.env[model.key_env]
		if (!key) throw new Error(`Missing ${model.key_env}; no calls made`)
		const budget = new EvalBudget(join(root, "exposure.json"), 10_000_000_000)
		const reportPath = join(root, "runs.json")
		const reportSchema = z.array(
			z.object({
				id: z.string(),
				plan: z.enum(plans),
				workflow: z.enum(workflows),
				evidence: z.literal("live"),
				success: z.boolean(),
				verification: z.string(),
				calls: z.array(
					z.object({
						id: z.string(),
						role: z.string(),
						budget_class: z.literal("standard"),
						reported: z.boolean(),
						usage: usageSchema,
						rates: modelSchema.shape.pricing,
					}),
				),
				customer_debit_nusd: z.number(),
				active_hold_nusd: z.number(),
				debit_evidence: z.literal("shadow_calculation").optional(),
				duplicate_side_effects: z.number(),
				invalid_protocol_executions: z.number(),
				premium_consent: z.boolean(),
			}),
		)
		const runs = existsSync(reportPath) ? reportSchema.parse(JSON.parse(readFileSync(reportPath, "utf8"))) : []
		let currentRun = ""
		let fatal: string | undefined
		const token = randomUUID()
		server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch(request) {
				if (
					request.headers.get("authorization") !== `Bearer ${token}` ||
					new URL(request.url).pathname !== "/v1/chat/completions" ||
					request.method !== "POST"
				) {
					return Response.json({ error: { message: "Evaluation endpoint only" } }, { status: 403 })
				}
				try {
					if (fatal) throw new Error(fatal)
					const raw = await request.text()
					if (Buffer.byteLength(raw) > 100000) throw new Error("Evaluation context bound exceeded")
					const fields = z.record(z.string(), z.unknown()).parse(JSON.parse(raw))
					if (fields.model !== model.upstream || (fields.n !== undefined && fields.n !== 1)) {
						throw new Error("Unapproved model or completion multiplicity")
					}
					const id = randomUUID()
					fields.max_tokens = 2048
					delete fields.max_completion_tokens
					fields.stream = true
					fields.stream_options = { include_usage: true }
					const body = JSON.stringify(fields)
					budget.reserve(id, currentRun, model.pricing, Buffer.byteLength(body) + 1024, 2048)
					const response = await fetch(upstreamURL, {
						method: "POST",
						headers: { "Content-Type": "application/json", "api-key": key },
						body,
						signal: AbortSignal.any([request.signal, AbortSignal.timeout(180000)]),
					})
					// Buffer only evaluation responses so evidence is persisted before the SDK
					// consumes the result. This is not a production streaming latency test.
					const text = await response.text()
					if (!response.ok) throw new Error(`Upstream status ${response.status}; risk reservation retained`)
					let measured: z.infer<typeof wireUsageSchema> | undefined
					for (const line of text.split(/\r?\n/)) {
						if (!line.startsWith("data:") || line.slice(5).trim() === "[DONE]") continue
						const chunk = z
							.object({ usage: wireUsageSchema.nullish() })
							.passthrough()
							.parse(JSON.parse(line.slice(5)))
						if (chunk.usage) measured = chunk.usage
					}
					if (measured) {
						budget.settle(id, {
							prompt_tokens: measured.prompt_tokens,
							completion_tokens: measured.completion_tokens,
							cached_tokens: measured.prompt_tokens_details?.cached_tokens ?? 0,
							cache_write_tokens: 0,
						})
					} else {
						fatal = "Missing provider usage; retained exposure and stopped experiment"
					}
					return new Response(text, { headers: { "Content-Type": "text/event-stream" } })
				} catch (error) {
					fatal = error instanceof Error ? error.message : "Evaluation proxy failed"
					return Response.json({ error: { message: fatal } }, { status: 503 })
				}
			},
		})
		for (const plan of plans)
			for (const workflow of workflows)
				for (let variant = 0; variant < 5; variant++) {
					if (fatal) break
					const id = `${plan}-${workflow}-${variant}`
					if (runs.some((run) => run.id === id)) continue
					if (budget.data.calls.some((call) => call.run_id === id)) {
						throw new Error(`Interrupted run ${id} needs review; restart cannot dispatch it again`)
					}
					currentRun = id
					const workspace = join(root, id, "workspace")
					mkdirSync(workspace, { recursive: true })
					const task = fixture(workflow, variant)
					writeFileSync(join(workspace, "index.mjs"), task.source)
					const testPath = join(root, id, "verification.mjs")
					writeFileSync(testPath, task.tests)
					let verified = false
					let fetched = false
					const tools = [
						createTool({
							name: "read_file",
							description: "Read an evaluation project file.",
							inputSchema: z.object({ path: z.enum(["index.mjs", "summary.md"]) }),
							execute: async ({ path }) =>
								existsSync(join(workspace, path))
									? { content: readFileSync(join(workspace, path), "utf8") }
									: { error: "File does not exist" },
						}),
						createTool({
							name: "write_file",
							description: "Replace an evaluation project file.",
							inputSchema: z.object({ path: z.enum(["index.mjs", "summary.md"]), content: z.string().max(12000) }),
							execute: async ({ path, content }) => {
								writeFileSync(join(workspace, path), content)
								verified = false
								return { written: path }
							},
						}),
						createTool({
							name: "run_tests",
							description: "Run immutable verification tests in a restricted networkless container.",
							inputSchema: z.object({}),
							execute: async () => {
								const result = await executeTests(workspace, testPath)
								verified = result.success
								return result
							},
						}),
						createTool({
							name: "fetch_reference",
							description: "Fetch the approved public reference https://example.com.",
							inputSchema: z.object({}),
							execute: async () => {
								try {
									const response = await fetch("https://example.com", {
										signal: AbortSignal.timeout(15000),
										redirect: "error",
									})
									if (!response.ok) return { error: `Reference returned ${response.status}` }
									const text = (await response.text()).slice(0, 12000)
									fetched = true
									return { url: "https://example.com", content: text }
								} catch (error) {
									return { error: error instanceof Error ? error.message : "Reference fetch failed" }
								}
							},
						}),
						createTool({
							name: "submit_result",
							description: "Submit after tests pass and requested project artifacts exist.",
							inputSchema: z.object({ summary: z.string().max(2000) }),
							lifecycle: { completesRun: true },
							execute: async ({ summary }) => ({ summary, testsPassed: verified }),
						}),
					]
					const agent = new Agent({
						providerId: "openai-compatible",
						modelId: model.upstream,
						baseUrl: `http://127.0.0.1:${server.port}/v1`,
						apiKey: token,
						systemPrompt:
							"You are a coding agent in an isolated evaluation project. Use tools to read/edit files and execute tests. Do not claim success without passing tests. Submit with submit_result. No shell or extra network tools exist.",
						tools,
						maxIterations: 10,
						toolExecution: "sequential",
						toolPolicies: { "*": { autoApprove: true } },
						completionPolicy: { requireCompletionTool: true },
					})
					const timeout = setTimeout(() => agent.abort("Evaluation task deadline"), 240000)
					let status = "failed"
					let failure = ""
					try {
						const result = await agent.run(task.prompt)
						status = result.status
						if (result.error) failure = result.error.message
					} catch (error) {
						failure = error instanceof Error ? error.message : "Agent failed"
					} finally {
						clearTimeout(timeout)
					}
					const finalTest = await executeTests(workspace, testPath)
					const summaryPath = join(workspace, "summary.md")
					const summary = existsSync(summaryPath) ? readFileSync(summaryPath, "utf8") : ""
					const success =
						status === "completed" &&
						finalTest.success &&
						(workflow !== "research" ||
							(fetched && /https:\/\/example\.com/.test(summary) && /documentation/i.test(summary)))
					const proof = {
						status,
						success,
						fetched,
						testPassed: finalTest.success,
						verificationSHA256: createHash("sha256").update(task.tests).digest("hex"),
						sourceSHA256: createHash("sha256")
							.update(readFileSync(join(workspace, "index.mjs")))
							.digest("hex"),
						testOutput: finalTest.output,
						failure,
					}
					writeFileSync(join(root, id, "result.json"), JSON.stringify(proof, null, 2))
					const calls = budget.data.calls.filter((call) => call.run_id === id)
					runs.push({
						id,
						plan,
						workflow,
						evidence: "live",
						success,
						verification: `${id}/result.json`,
						calls: calls.map((call) => ({
							id: call.id,
							role: "generation",
							budget_class: "standard",
							reported: call.state === "measured",
							usage: call.usage ?? {
								prompt_tokens: 0,
								completion_tokens: 0,
								cached_tokens: 0,
								cache_write_tokens: 0,
							},
							rates: call.rates,
						})),
						customer_debit_nusd: calls.reduce((sum, call) => sum + (call.actual_nusd ?? 0), 0),
						active_hold_nusd: 0,
						duplicate_side_effects: 0,
						invalid_protocol_executions: 0,
						premium_consent: false,
						debit_evidence: "shadow_calculation",
					})
					writeFileSync(reportPath, JSON.stringify(runs, null, 2))
					console.log(JSON.stringify({ id, success, calls: calls.length, exposure_nusd: budget.exposure }))
				}
		// A separate controlled long-prefix probe distinguishes short-fixture cache
		// eligibility from whether the deployment can report cache reads at all.
		const probePath = join(root, "cache-probe.json")
		if (!fatal && runs.length === 30 && !existsSync(probePath)) {
			currentRun = "controlled-cache-probe"
			if (budget.data.calls.some((call) => call.run_id === currentRun)) {
				throw new Error("Interrupted cache probe needs review before restarting")
			}
			const schema = Array.from(
				{ length: 100 },
				(_, index) =>
					`Entity ${index}: id is immutable and unique, created_at is UTC, status is active or archived. ` +
					`GET /entities/${index} returns the entity; PATCH /entities/${index} changes status only after authorization. ` +
					"Requests use an idempotency key. Duplicate writes return the original result. Missing records return 404. " +
					"Validation precedes persistence. Audit records preserve actor identity and request ID.",
			).join("\n")
			const probe = new Agent({
				providerId: "openai-compatible",
				modelId: model.upstream,
				baseUrl: `http://127.0.0.1:${server.port}/v1`,
				apiKey: token,
				systemPrompt: `You are reviewing this synthetic API specification. Answer concisely.\n${schema}`,
				maxIterations: 1,
			})
			const first = await probe.run("Summarize the idempotency and authorization requirements in two sentences.")
			const second = await probe.continue("Now identify one useful regression test, in one sentence.")
			const calls = budget.data.calls.filter((call) => call.run_id === currentRun)
			writeFileSync(
				probePath,
				JSON.stringify(
					{
						kind: "controlled_long_prefix_not_workflow_capacity",
						first_status: first.status,
						second_status: second.status,
						prefix_bytes: Buffer.byteLength(schema),
						calls: calls.map((call) => ({
							id: call.id,
							usage: call.usage,
							state: call.state,
							actual_nusd: call.actual_nusd,
						})),
						disclaimer: "Two turns are a diagnostic observation, not a guaranteed cache hit rate.",
					},
					null,
					2,
				),
			)
		}
		const workflowIDs = new Set(runs.map((run) => run.id))
		const workflowCalls = budget.data.calls.filter((call) => workflowIDs.has(call.run_id))
		const prompt = workflowCalls.reduce((sum, call) => sum + (call.usage?.prompt_tokens ?? 0), 0)
		const cached = workflowCalls.reduce((sum, call) => sum + (call.usage?.cached_tokens ?? 0), 0)
		writeFileSync(
			join(root, "summary.json"),
			JSON.stringify(
				{
					evidence: "live",
					scope: "SDK tools with isolated shadow Sparks cost projection; not production dispatch cutover",
					model: model.upstream,
					priceVersion: model.pricing.version,
					runs: runs.length,
					successful: runs.filter((run) => run.success).length,
					exposure_nusd: budget.exposure,
					limit_nusd: budget.data.limit_nusd,
					input_tokens: prompt,
					cached_input_tokens: cached,
					cache_read_ratio: prompt ? cached / prompt : null,
					cache_probe: existsSync(probePath) ? "cache-probe.json" : null,
					grants_nusd: grants,
					blocked: fatal ?? null,
					quality_gate_passed: runs.length === 30 && runs.filter((run) => run.success).length >= 27,
					disclaimer:
						"Small fixtures; not multi-file or full-working-day capacity proof. No hidden reviewer/classifier configured. Unknown usage retains experiment exposure, not customer debit.",
				},
				null,
				2,
			),
		)
		if (fatal || runs.length !== 30 || runs.filter((run) => run.success).length < 27) {
			throw new Error(fatal ?? "Live workflow completion gate failed")
		}
	} finally {
		server?.stop(true)
		closeSync(lock)
		rmSync(lockPath)
	}
}

if (import.meta.main) {
	const [catalog, output, ...extra] = process.argv.slice(2)
	if (!catalog || !output || extra.length)
		throw new Error("Usage: bun scripts\\ola-live-eval.ts <catalog.json> <private-output-directory>")
	await runEvaluation(catalog, output)
}
