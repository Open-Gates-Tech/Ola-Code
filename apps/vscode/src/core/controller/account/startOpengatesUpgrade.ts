import type { EmptyRequest } from "@shared/proto/cline/common"
import { String } from "@shared/proto/cline/common"
import { createOpengatesUpgradeCheckout } from "@/sdk/opengates-account"
import { OpengatesAuthService } from "@/sdk/opengates-auth-service"
import { openExternal } from "@/utils/env"
import type { Controller } from "../index"

export async function startOpengatesUpgrade(_controller: Controller, _request: EmptyRequest): Promise<String> {
	const opengates = OpengatesAuthService.get()
	if (!opengates) {
		throw new Error("Opengates sign-in is not enabled.")
	}
	await opengates.requireAuthentication()
	const url = await createOpengatesUpgradeCheckout(opengates)
	await openExternal(url)
	return String.create({ value: url })
}
