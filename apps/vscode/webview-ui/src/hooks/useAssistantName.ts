import { useExtensionState } from "@/context/ExtensionStateContext"

export const getAssistantName = (opengatesAuthEnabled?: boolean) => (opengatesAuthEnabled ? "Ola" : "Cline")

/** The assistant's display name: "Ola" for Opengates builds, "Cline" otherwise. */
export function useAssistantName(): string {
	const { opengatesAuthEnabled } = useExtensionState()
	return getAssistantName(opengatesAuthEnabled)
}
