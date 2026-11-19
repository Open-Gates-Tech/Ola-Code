import { Empty, type EmptyRequest } from "@shared/proto/cline/common"
import { OlaWorkspaceChoice } from "@/sdk/ola-workspace"
import { chooseOlaWorkspace as choose } from "@/sdk/ola-workspace-picker"
import { OpengatesAuthService } from "@/sdk/opengates-auth-service"
import { createOpengatesFetch } from "@/sdk/opengates-provider"
import type { Controller } from "../index"

/** Opens the workspace picker; the account view reloads afterwards to show the choice. */
export async function chooseOlaWorkspace(_controller: Controller, _request: EmptyRequest): Promise<Empty> {
	const auth = OpengatesAuthService.get()
	const choice = OlaWorkspaceChoice.get()
	if (!auth || !choice) throw new Error("Opengates sign-in is not enabled.")
	await auth.requireAuthentication()
	await choose(auth, choice, createOpengatesFetch(auth))
	return Empty.create()
}
