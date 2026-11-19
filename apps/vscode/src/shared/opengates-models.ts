import type { ApiConfiguration } from "./api"
import type { Mode } from "./storage/types"

// All aliases must fit the smallest eligible context, including Deep's 200k
// routes. Reserve output and server-injected guidance before SDK compaction.
export const OPENGATES_CONTEXT_WINDOW = 200_000
export const OPENGATES_MAX_OUTPUT_TOKENS = 8_192
export const OPENGATES_SERVER_CONTEXT_HEADROOM = 16_384
export const OPENGATES_MAX_INPUT_TOKENS =
	OPENGATES_CONTEXT_WINDOW - OPENGATES_MAX_OUTPUT_TOKENS - OPENGATES_SERVER_CONTEXT_HEADROOM

export function getOpengatesModelInfo(modelId: string): ModelInfo {
	return {
		id: modelId,
		name: OPENGATES_MODELS.find(({ id }) => id === modelId)?.label ?? modelId,
		contextWindow: OPENGATES_CONTEXT_WINDOW,
		maxInputTokens: OPENGATES_MAX_INPUT_TOKENS,
		maxTokens: OPENGATES_MAX_OUTPUT_TOKENS,
		capabilities: ["tools", "streaming"],
	}
}

export const OPENGATES_MODELS = [
	{ id: "ola-code-fast", label: "Quick" },
	{ id: "ola-code-reason", label: "Balanced" },
	{ id: "ola-code-pro", label: "Deep" },
] as const

export function resolveOpengatesModel(config: ApiConfiguration | undefined, mode: Mode): string {
	const model = mode === "plan" ? config?.planModeOpenAiModelId : config?.actModeOpenAiModelId
	return OPENGATES_MODELS.find(({ id }) => id === model)?.id ?? OPENGATES_MODELS[0].id
}

import type { ModelInfo } from "@cline/llms"
