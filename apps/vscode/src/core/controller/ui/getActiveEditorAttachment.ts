import type { String as ProtoString, StringRequest } from "@shared/proto/cline/common"
import { getFileMentionFromPath } from "@/core/mentions"
import { HostProvider } from "@/hosts/host-provider"
import { canSuggestEditorFile } from "@/shared/active-editor-context"
import type { Controller } from "../index"

export async function getActiveEditorAttachment(_controller: Controller, request: StringRequest): Promise<ProtoString> {
	const editor = await HostProvider.window.getActiveEditor({ includeSelection: true })
	if (!request.value || editor.contextId !== request.value) {
		throw new Error("The active file or selection changed. Select the file chip again.")
	}
	if (!editor.filePath || !canSuggestEditorFile(editor.filePath)) {
		throw new Error("This file cannot be attached from the active editor.")
	}
	if (editor.startLine !== undefined && editor.endLine !== undefined && editor.selectedText !== undefined) {
		return {
			value: `Selected lines ${editor.startLine}-${editor.endLine} from ${editor.filePath}:\n\`\`\`${editor.languageId ?? ""}\n${editor.selectedText}\n\`\`\``,
		}
	}
	return { value: await getFileMentionFromPath(editor.filePath) }
}
