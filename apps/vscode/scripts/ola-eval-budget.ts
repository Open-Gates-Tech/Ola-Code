import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { z } from "zod"

const rateSchema = z.object({
	version: z.string().min(1),
	input_nusd: z.number().int().positive(),
	cached_nusd: z.number().int().positive(),
	cache_write_nusd: z.number().int().positive(),
	output_nusd: z.number().int().positive(),
})
export type Rates = z.infer<typeof rateSchema>
export const usageSchema = z
	.object({
		prompt_tokens: z.number().int().nonnegative().max(2_000_000),
		completion_tokens: z.number().int().nonnegative().max(2_000_000),
		cached_tokens: z.number().int().nonnegative().default(0),
		cache_write_tokens: z.number().int().nonnegative().default(0),
	})
	.refine((u) => u.cached_tokens + u.cache_write_tokens <= u.prompt_tokens)
export type Usage = z.infer<typeof usageSchema>
const callSchema = z.object({
	id: z.string().min(1),
	run_id: z.string().min(1),
	reserved_nusd: z.number().int().positive(),
	actual_nusd: z.number().int().nonnegative().optional(),
	rates: rateSchema,
	usage: usageSchema.optional(),
	state: z.enum(["unknown", "measured"]),
})
const journalSchema = z.object({
	version: z.literal("ola-live-eval-v1"),
	limit_nusd: z.number().int().positive().max(10_000_000_000),
	calls: z.array(callSchema),
})

export function exactCost(rates: Rates, usage: Usage): number {
	const r = rateSchema.parse(rates)
	const u = usageSchema.parse(usage)
	const value =
		BigInt(u.prompt_tokens - u.cached_tokens - u.cache_write_tokens) * BigInt(r.input_nusd) +
		BigInt(u.cached_tokens) * BigInt(r.cached_nusd) +
		BigInt(u.cache_write_tokens) * BigInt(r.cache_write_nusd) +
		BigInt(u.completion_tokens) * BigInt(r.output_nusd)
	if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Evaluation cost overflow")
	return Number(value)
}

// The caller holds an exclusive process lock for the journal's entire lifetime.
export class EvalBudget {
	readonly data: z.infer<typeof journalSchema>
	constructor(
		private readonly path: string,
		limit: number,
	) {
		try {
			this.data = journalSchema.parse(JSON.parse(readFileSync(path, "utf8")))
			if (this.data.limit_nusd !== limit) throw new Error("Cannot change a persisted experiment limit")
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
			this.data = journalSchema.parse({ version: "ola-live-eval-v1", limit_nusd: limit, calls: [] })
			this.save()
		}
		const ids = new Set<string>()
		for (const call of this.data.calls) {
			if (ids.has(call.id)) throw new Error("Duplicate evaluation call identity")
			ids.add(call.id)
			if (call.state === "measured" && (!call.usage || call.actual_nusd !== exactCost(call.rates, call.usage))) {
				throw new Error("Persisted evaluation cost does not reconcile")
			}
			if (call.state === "unknown" && (call.usage || call.actual_nusd !== undefined)) {
				throw new Error("Unknown evidence contains invented actual usage")
			}
		}
		if (this.exposure > limit) throw new Error("Persisted experiment already exceeds its cap")
	}
	get exposure(): number {
		return this.data.calls.reduce(
			(sum, call) => sum + (call.actual_nusd === undefined ? call.reserved_nusd : Math.max(call.actual_nusd, 0)),
			0,
		)
	}
	reserve(id: string, run: string, rates: Rates, promptBound: number, outputBound: number): void {
		if (this.data.calls.some((call) => call.id === id)) throw new Error("A replay cannot authorize upstream dispatch")
		const maximumRate = Math.max(rates.input_nusd, rates.cached_nusd, rates.cache_write_nusd)
		const reserved = exactCost(
			{ ...rates, input_nusd: maximumRate },
			{ prompt_tokens: promptBound, completion_tokens: outputBound, cached_tokens: 0, cache_write_tokens: 0 },
		)
		if (reserved <= 0 || reserved > this.data.limit_nusd - this.exposure) {
			throw new Error("Experiment exposure cap reached; no upstream dispatch authorized")
		}
		this.data.calls.push(
			callSchema.parse({
				id,
				run_id: run,
				reserved_nusd: reserved,
				rates,
				state: "unknown",
			}),
		)
		this.save()
	}
	settle(id: string, usage: Usage): void {
		const call = this.data.calls.find((entry) => entry.id === id)
		if (!call || call.state !== "unknown") throw new Error("Settlement missing or already completed")
		const actual = exactCost(call.rates, usage)
		// Leave the full hold unresolved when a supposedly conservative bound fails.
		if (actual > call.reserved_nusd) throw new Error("Provider usage exceeded the evaluation bound; stop for review")
		call.usage = usageSchema.parse(usage)
		call.actual_nusd = actual
		call.state = "measured"
		this.save()
	}
	private save(): void {
		const pending = `${this.path}.pending`
		const fd = openSync(pending, "w", 0o600)
		try {
			writeFileSync(fd, JSON.stringify(this.data, null, 2))
			fsyncSync(fd)
		} finally {
			closeSync(fd)
		}
		renameSync(pending, this.path)
	}
}
