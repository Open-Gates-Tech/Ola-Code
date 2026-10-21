import { diffLines } from "diff"

export interface ChangesSummary {
	files: number
	additions: number
	deletions: number
}

export function summarizeContentDiffs(diffs: { leftContent: string; rightContent: string }[]): ChangesSummary {
	let additions = 0
	let deletions = 0
	for (const { leftContent, rightContent } of diffs) {
		if (leftContent === rightContent) continue
		for (const change of diffLines(leftContent, rightContent)) {
			if (change.added) additions += change.count ?? 0
			else if (change.removed) deletions += change.count ?? 0
		}
	}
	return { files: diffs.length, additions, deletions }
}
