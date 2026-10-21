import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EvalBudget, exactCost } from "./ola-eval-budget"

const rates = { version: "test", input_nusd: 400, cached_nusd: 100, cache_write_nusd: 400, output_nusd: 1600 }
test("cache is a subset of input and fractional Sparks retain precision", () => {
	expect(exactCost(rates, { prompt_tokens: 100, completion_tokens: 2, cached_tokens: 90, cache_write_tokens: 0 })).toBe(16200)
	expect(() => exactCost(rates, { prompt_tokens: 1, completion_tokens: 0, cached_tokens: 2, cache_write_tokens: 0 })).toThrow()
})
test("durable unknown exposure, replay, restart and cap protect dispatch", () => {
	const root = mkdtempSync(join(tmpdir(), "ola-budget-test-"))
	try {
		const path = join(root, "journal.json")
		let budget = new EvalBudget(path, 100000)
		budget.reserve("call-1", "run", rates, 100, 10)
		expect(budget.exposure).toBe(56000)
		expect(() => budget.reserve("call-2", "run", rates, 100, 10)).toThrow()
		budget = new EvalBudget(path, 100000)
		expect(budget.exposure).toBe(56000)
		expect(() => budget.reserve("call-1", "run", rates, 1, 1)).toThrow()
		budget.settle("call-1", { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0, cache_write_tokens: 0 })
		expect(budget.exposure).toBe(7200)
		expect(() =>
			budget.settle("call-1", { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0, cache_write_tokens: 0 }),
		).toThrow()
		expect(() => new EvalBudget(path, 200000)).toThrow()
	} finally {
		rmSync(root, { recursive: true })
	}
})
