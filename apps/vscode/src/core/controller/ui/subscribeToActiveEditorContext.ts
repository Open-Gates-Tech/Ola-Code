import type { EmptyRequest } from "@shared/proto/cline/common"
import { ActiveEditorContext } from "@shared/proto/cline/ui"
import { canSuggestEditorFile } from "@/shared/active-editor-context"
import type { GetActiveEditorResponse } from "@/shared/proto/host/window"
import { Logger } from "@/shared/services/Logger"
import { getRequestRegistry, type StreamingResponseHandler } from "../grpc-handler"
import type { Controller } from "../index"

let current = ActiveEditorContext.create()
const subscriptions = new Set<StreamingResponseHandler<ActiveEditorContext>>()

export async function publishActiveEditorContext(editor: GetActiveEditorResponse): Promise<void> {
	current =
		editor.filePath && editor.contextId && canSuggestEditorFile(editor.filePath)
			? ActiveEditorContext.create({
					contextId: editor.contextId,
					fileName: editor.filePath.replace(/\\/g, "/").split("/").pop(),
					languageId: editor.languageId,
					startLine: editor.startLine,
					endLine: editor.endLine,
				})
			: ActiveEditorContext.create()
	await Promise.all(
		Array.from(subscriptions, async (stream) => {
			try {
				await stream(current, false)
			} catch (error) {
				subscriptions.delete(stream)
				Logger.error("Could not update active editor context", error)
			}
		}),
	)
}

export async function subscribeToActiveEditorContext(
	_controller: Controller,
	_request: EmptyRequest,
	stream: StreamingResponseHandler<ActiveEditorContext>,
	requestId?: string,
): Promise<void> {
	subscriptions.add(stream)
	if (requestId) {
		getRequestRegistry().registerRequest(
			requestId,
			() => subscriptions.delete(stream),
			{ type: "activeEditorContext_subscription" },
			stream,
		)
	}
	await stream(current, false)
}
