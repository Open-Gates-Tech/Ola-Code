import { type BooleanRequest, Empty } from "@shared/proto/cline/common"
import { setOpengatesAutoRenew as setAutoRenew } from "@/sdk/opengates-account"
import { OpengatesAuthService } from "@/sdk/opengates-auth-service"
import type { Controller } from "../index"

/** Cancels (false) or restarts (true) automatic renewal of the person's subscription. */
export async function setOpengatesAutoRenew(_controller: Controller, request: BooleanRequest): Promise<Empty> {
	const auth = OpengatesAuthService.get()
	if (!auth) throw new Error("Opengates sign-in is not enabled.")
	await auth.requireAuthentication()
	await setAutoRenew(auth, request.value)
	return Empty.create()
}
