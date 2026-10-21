import { EmptyRequest } from "@shared/proto/cline/common"
import { FileDiffIcon } from "lucide-react"
import { memo, useEffect, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { CheckpointsServiceClient } from "@/services/grpc-client"

interface Summary {
	files: number
	additions: number
	deletions: number
}

/**
 * Ola's replacement for the per-response "View Changes" button: a compact
 * "N file(s) +A -D" summary that opens the multi-file diff. The "composer"
 * variant sits above the chat field; the "response" variant sits under the
 * latest finished response and reads "N file(s) changed".
 */
export const ChangesSummaryBar = memo(({ variant = "composer" }: { variant?: "composer" | "response" }) => {
	const { currentTaskItem, turnState, enableCheckpointsSetting } = useExtensionState()
	const taskId = currentTaskItem?.id
	const isStreaming = turnState?.phase === "streaming"
	const [summary, setSummary] = useState<Summary | undefined>(undefined)

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the task changes
	useEffect(() => {
		setSummary(undefined)
	}, [taskId])

	// biome-ignore lint/correctness/useExhaustiveDependencies: turnState.seq re-checks after every settled turn
	useEffect(() => {
		// Refresh once the turn settles; while Ola is still working keep the last value.
		if (!taskId || !enableCheckpointsSetting || isStreaming) {
			return
		}
		let cancelled = false
		CheckpointsServiceClient.checkpointLatestChangesSummary(EmptyRequest.create({}))
			.then((result) => {
				if (!cancelled) {
					setSummary({
						files: Number(result.files ?? 0),
						additions: Number(result.additions ?? 0),
						deletions: Number(result.deletions ?? 0),
					})
				}
			})
			.catch((err) => {
				console.error("Failed to load changes summary:", err)
			})
		return () => {
			cancelled = true
		}
	}, [taskId, enableCheckpointsSetting, isStreaming, turnState?.seq])

	if (!taskId || !enableCheckpointsSetting || !summary || summary.files <= 0) {
		return null
	}

	const isResponse = variant === "response"

	return (
		<button
			aria-label="View changes"
			className={isResponse ? "ola-changes-summary ola-changes-summary--response" : "ola-changes-summary"}
			data-testid={isResponse ? "ola-response-changes-summary" : "ola-changes-summary"}
			onClick={() =>
				CheckpointsServiceClient.checkpointViewLatestChanges(EmptyRequest.create({})).catch((err) =>
					console.error("Failed to show changes:", err),
				)
			}
			title="View changes"
			type="button">
			{!isResponse && <FileDiffIcon aria-hidden className="size-3.5 shrink-0" />}
			<span>
				{summary.files} {summary.files === 1 ? "file" : "files"}
				{isResponse && " changed"}
			</span>
			<span className="text-success">+{summary.additions}</span>
			<span className="text-error">-{summary.deletions}</span>
		</button>
	)
})

ChangesSummaryBar.displayName = "ChangesSummaryBar"
