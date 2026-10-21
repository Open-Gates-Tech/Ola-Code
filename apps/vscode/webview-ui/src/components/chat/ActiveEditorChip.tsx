import { EmptyRequest, StringRequest } from "@shared/proto/cline/common"
import type { ActiveEditorContext } from "@shared/proto/cline/ui"
import { useEffect, useRef, useState } from "react"
import { UiServiceClient } from "@/services/grpc-client"
import { FileTypeIcon } from "./FileTypeIcon"

export function ActiveEditorChip({ onAttach }: { onAttach: (text: string) => void }) {
	const [editor, setEditor] = useState<ActiveEditorContext | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [attaching, setAttaching] = useState(false)
	const latestId = useRef<string | undefined>(undefined)

	useEffect(
		() =>
			UiServiceClient.subscribeToActiveEditorContext(EmptyRequest.create(), {
				onResponse: (next) => {
					latestId.current = next.contextId
					setEditor(next.contextId ? next : null)
					setError(null)
				},
				onError: (cause) => {
					console.error("Could not update active file suggestion:", cause)
					latestId.current = undefined
					setEditor(null)
					setError("Could not update the active file. Reload the window to try again.")
				},
				onComplete: () => {},
			}),
		[],
	)

	const attach = async () => {
		if (!editor) return
		const contextId = editor.contextId
		setAttaching(true)
		setError(null)
		try {
			const result = await UiServiceClient.getActiveEditorAttachment(StringRequest.create({ value: contextId }))
			if (latestId.current !== contextId) {
				setError("The active file or selection changed. Select the file chip again.")
				return
			}
			onAttach(result.value)
		} catch (cause) {
			console.error("Could not attach the active file:", cause)
			setError("Could not attach this file. Check the active file and try again.")
		} finally {
			setAttaching(false)
		}
	}

	if (!editor && !error) return null
	const label = editor
		? `${editor.fileName}${editor.startLine === undefined ? "" : `:${editor.startLine}${editor.endLine !== editor.startLine ? `-${editor.endLine}` : ""}`}`
		: ""

	return (
		<div className="px-2 pt-2">
			{editor && (
				<button
					aria-label={`Attach ${label}`}
					className="ola-pill-button max-w-full"
					disabled={attaching}
					onClick={() => void attach()}
					title={`Add ${label} to your message`}
					type="button">
					<FileTypeIcon fileName={editor.fileName} />
					<span className="truncate">{label}</span>
				</button>
			)}
			{error && (
				<p className="m-0 text-xs text-error" role="alert">
					{error}
				</p>
			)}
		</div>
	)
}
