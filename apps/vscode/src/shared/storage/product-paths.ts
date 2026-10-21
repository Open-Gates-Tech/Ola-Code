import os from "node:os"
import path from "node:path"
import { name } from "../../../package.json"

export function resolveProductHomeDir(): string {
	return process.env.CLINE_DIR?.trim() || path.join(os.homedir(), name === "ola-code" ? ".ola-code" : ".cline")
}

export const productDocumentsDirectory = name === "ola-code" ? "Ola Code" : "Cline"
