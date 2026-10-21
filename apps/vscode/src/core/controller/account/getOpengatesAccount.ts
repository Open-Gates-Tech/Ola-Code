import { OpengatesAccount } from "@shared/proto/cline/account"
import type { EmptyRequest } from "@shared/proto/cline/common"
import { fetchOpengatesAccount } from "@/sdk/opengates-account"
import { OpengatesAuthService } from "@/sdk/opengates-auth-service"
import type { Controller } from "../index"

export async function getOpengatesAccount(controller: Controller, _request: EmptyRequest): Promise<OpengatesAccount> {
	const opengates = OpengatesAuthService.get()
	if (!opengates) {
		throw new Error("Opengates sign-in is not enabled.")
	}
	await opengates.requireAuthentication()
	return fetchOpengatesAccount(opengates, undefined, controller.stateManager.getGlobalStateKey("opengatesAgentBudgetTaskId"))
}
