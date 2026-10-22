import { String, type StringRequest } from "@shared/proto/cline/common"
import { createOpengatesPlanCheckout } from "@/sdk/opengates-account"
import { OpengatesAuthService } from "@/sdk/opengates-auth-service"
import { openExternal } from "@/utils/env"
import type { Controller } from "../index"

export async function startOpengatesPlanCheckout(_controller: Controller, request: StringRequest): Promise<String> {
	const auth = OpengatesAuthService.get()
	if (!auth) throw new Error("Opengates sign-in is not enabled.")
	await auth.requireAuthentication()
	const url = await createOpengatesPlanCheckout(auth, request.value)
	await openExternal(url)
	return String.create({ value: url })
}
