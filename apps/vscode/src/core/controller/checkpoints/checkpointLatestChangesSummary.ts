import { CheckpointChangesSummary } from "@shared/proto/cline/checkpoints"
import { EmptyRequest } from "@shared/proto/cline/common"
import { Controller } from ".."

/**
 * Summarizes the changes between the latest checkpoint and the current working
 * tree as a file count plus added/removed line totals. All zero when nothing
 * can be compared.
 */
export async function checkpointLatestChangesSummary(
	controller: Controller,
	_request: EmptyRequest,
): Promise<CheckpointChangesSummary> {
	const sdkGetLatestCheckpointChangesSummary = (
		controller as Controller & {
			getLatestCheckpointChangesSummary?: () => Promise<{ files: number; additions: number; deletions: number }>
		}
	).getLatestCheckpointChangesSummary
	if (sdkGetLatestCheckpointChangesSummary) {
		return CheckpointChangesSummary.create(await sdkGetLatestCheckpointChangesSummary.call(controller))
	}
	return CheckpointChangesSummary.create({ files: 0, additions: 0, deletions: 0 })
}
