/**
 * Terminal outcome of a finished command row. `commandCompleted` only says the
 * tool call finished; this says whether the command is known to have succeeded.
 */
export type CommandOutcome = "succeeded" | "failed" | "unconfirmed" | "detached"

/** Prefix of a run_commands result whose terminal completion was never observed. */
export const COMMAND_COMPLETION_UNOBSERVED_PREFIX = "[Command completion could not be observed;"

/** Line of a run_commands result for a command left running in the terminal. */
export const COMMAND_DETACHED_OUTPUT_MARKER =
	"This is partial output; further output is being redirected to this file, which you can read to check progress:"

function resultText(record: Record<string, unknown>): string {
	return [record.result, record.error].filter((value): value is string => typeof value === "string").join("\n")
}

/**
 * Flatten a live ToolOperationResult[] or a persisted tool_result payload
 * (structured array, JSON string, or text content blocks) into result items.
 */
function resultItems(output: unknown, depth = 0): unknown[] {
	if (output === undefined || output === null || depth > 3) {
		return []
	}
	if (typeof output === "string") {
		const trimmed = output.trim()
		if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
			try {
				return resultItems(JSON.parse(trimmed), depth + 1)
			} catch {
				// Plain text that merely looks like JSON.
			}
		}
		return trimmed ? [output] : []
	}
	if (Array.isArray(output)) {
		return output.flatMap((item) => {
			if (item !== null && typeof item === "object" && !Array.isArray(item)) {
				const block = item as Record<string, unknown>
				if (block.type === "text" && typeof block.text === "string") {
					return resultItems(block.text, depth + 1)
				}
				return [item]
			}
			return resultItems(item, depth + 1)
		})
	}
	return [output]
}

/**
 * Classify a finished run_commands/execute_command result. Only an explicit
 * `success: true` result is evidence of success; a missing result, plain text
 * without a success flag, or an unobserved completion is never reported as
 * success. Works for live results and for results restored from history.
 */
export function classifyCommandOutcome(error: unknown, output: unknown): CommandOutcome {
	if (error) {
		return "failed"
	}
	let detached = false
	let failed = false
	let succeeded = false
	for (const item of resultItems(output)) {
		if (typeof item === "string") {
			if (item.startsWith(COMMAND_COMPLETION_UNOBSERVED_PREFIX)) return "unconfirmed"
			detached ||= item.includes(COMMAND_DETACHED_OUTPUT_MARKER)
			continue
		}
		if (item === null || typeof item !== "object") {
			continue
		}
		const record = item as Record<string, unknown>
		const text = resultText(record)
		if (record.success === false) {
			if (text.includes(COMMAND_COMPLETION_UNOBSERVED_PREFIX)) return "unconfirmed"
			failed = true
			continue
		}
		detached ||= text.includes(COMMAND_DETACHED_OUTPUT_MARKER)
		succeeded ||= record.success === true
	}
	if (failed) return "failed"
	if (detached) return "detached"
	return succeeded ? "succeeded" : "unconfirmed"
}
