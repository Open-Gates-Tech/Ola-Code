import * as vscode from "vscode"
import { ExtensionRegistryInfo } from "@/registry"

/** URI scheme for immutable virtual documents used by multi-file diffs and review comments. */
export const DIFF_VIEW_URI_SCHEME = ExtensionRegistryInfo.diffScheme

export const diffContentProvider: vscode.TextDocumentContentProvider = {
	provideTextDocumentContent(uri: vscode.Uri): string {
		return Buffer.from(uri.query, "base64").toString("utf-8")
	},
}
