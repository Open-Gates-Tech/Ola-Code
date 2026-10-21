import { EmptyRequest, String } from "@shared/proto/cline/common"
import { AuthService } from "@/sdk/auth-service"
import { OpengatesAuthService } from "@/sdk/opengates-auth-service"
import { Controller } from "../index"

/**
 * Handles the user clicking the login link in the UI.
 * Uses Opengates OAuth in VS Code, and SDK-backed Cline OAuth in other hosts.
 *
 * @param controller The controller instance.
 * @returns The login URL as a string.
 */
export async function accountLoginClicked(_controller: Controller, _: EmptyRequest): Promise<String> {
	const opengates = OpengatesAuthService.get()
	if (opengates) return { value: await opengates.login() }
	return await AuthService.getInstance().createAuthRequest()
}
