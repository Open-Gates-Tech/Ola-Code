import * as vscode from "vscode"

import { canSuggestEditorFile } from "@/shared/active-editor-context"
import { GetActiveEditorRequest, GetActiveEditorResponse } from "@/shared/proto/index.host"

export async function getActiveEditor(request: GetActiveEditorRequest): Promise<GetActiveEditorResponse> {
	const editor = vscode.window.activeTextEditor
	const filePath = editor?.document.uri.fsPath
	if (!editor || editor.document.uri.scheme !== "file" || !filePath || !canSuggestEditorFile(filePath)) {
		return { filePath }
	}
	const { document, selection } = editor
	const startLine = selection.isEmpty ? undefined : selection.start.line + 1
	const endLine = selection.isEmpty
		? undefined
		: selection.end.line + (selection.end.character === 0 && selection.end.line > selection.start.line ? 0 : 1)
	return {
		filePath,
		languageId: document.languageId,
		startLine,
		endLine,
		contextId: JSON.stringify([document.uri.toString(), document.version, selection.start, selection.end]),
		selectedText:
			request.includeSelection && startLine !== undefined && endLine !== undefined
				? document.getText(new vscode.Range(startLine - 1, 0, endLine - 1, document.lineAt(endLine - 1).text.length))
				: undefined,
	}
}
