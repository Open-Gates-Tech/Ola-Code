export function canSuggestEditorFile(filePath: string): boolean {
	const name = filePath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? ""
	return (
		!!name &&
		!/^\.env(?:[.-]|$)/.test(name) &&
		!/\.(?:pem|key|p12|pfx|keystore)$/.test(name) &&
		!/^(?:id_rsa|id_ed25519|credentials(?:\..*)?|secrets?(?:\..*)?)$/.test(name)
	)
}
