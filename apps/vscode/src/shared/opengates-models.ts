import type { ApiConfiguration } from "./api"
import type { Mode } from "./storage/types"

export const OPENGATES_MODELS = [
	{ id: "ola-code-fast", label: "Fast" },
	{ id: "ola-code-reason", label: "Thinking" },
	{ id: "ola-code-pro", label: "Pro" },
] as const

export function resolveOpengatesModel(config: ApiConfiguration | undefined, mode: Mode): string {
	const model = mode === "plan" ? config?.planModeOpenAiModelId : config?.actModeOpenAiModelId
	return OPENGATES_MODELS.find(({ id }) => id === model)?.id ?? OPENGATES_MODELS[0].id
}
