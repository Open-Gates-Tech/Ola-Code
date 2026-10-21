import { AuthService } from "@/sdk/auth-service"
import { OpengatesAuthService } from "@/sdk/opengates-auth-service"
import { AuthState, EmptyRequest } from "@/shared/proto/index.cline"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."
import { getRequestRegistry, StreamingResponseHandler } from "../grpc-handler"

export async function subscribeToAuthStatusUpdate(
	controller: Controller,
	request: EmptyRequest,
	responseStream: StreamingResponseHandler<AuthState>,
	requestId?: string,
): Promise<void> {
	const opengates = OpengatesAuthService.get()
	if (opengates) {
		const unsubscribe = await opengates.subscribe(async (state) => {
			if (state.user) controller.stateManager.setGlobalState("welcomeViewCompleted", true)
			try {
				await responseStream(state, false)
				await controller.postStateToWebview()
			} catch (error) {
				Logger.error("Failed to publish Opengates authentication state", error)
			}
		})
		if (requestId) {
			getRequestRegistry().registerRequest(requestId, unsubscribe, { type: "opengates_auth" }, responseStream)
		}
		return
	}
	return AuthService.getInstance().subscribeToAuthStatusUpdate(controller, request, responseStream, requestId)
}
