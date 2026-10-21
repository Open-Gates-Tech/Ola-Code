import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { ClineAuthStatus } from "@/components/account/ClineAuthStatus"
import { useClineSignIn } from "@/context/ClineAuthContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import ClineLogoVariable from "../../assets/ClineLogoVariable"
import { ClinePassWelcomeCallout } from "./ClinePassCard"

// export const AccountWelcomeView = () => (
// 	<div className="flex flex-col items-center pr-3 gap-2.5">
// 		<ClineLogoWhite className="size-16 mb-4" />
export const AccountWelcomeView = () => {
	const { environment, opengatesAuthEnabled } = useExtensionState()
	const { isLoginLoading, authStatusMessage, handleSignIn } = useClineSignIn()

	if (opengatesAuthEnabled) {
		return (
			<div className="flex flex-col items-center gap-3 p-5">
				<h2>Welcome to Ola Code</h2>
				<p>Sign in with your Opengates account to start chatting.</p>
				<VSCodeButton disabled={isLoginLoading} onClick={handleSignIn}>
					{isLoginLoading ? "Opening sign-in..." : "Sign In with Opengates"}
				</VSCodeButton>
				<ClineAuthStatus message={authStatusMessage} />
			</div>
		)
	}

	return (
		<div className="flex flex-col items-center gap-2.5">
			<ClineLogoVariable className="size-16 mb-4" environment={environment} />

			<p>
				Sign up for an account to get access to the latest models, billing dashboard to view usage and credits, and more
				upcoming features.
			</p>

			<ClinePassWelcomeCallout />

			<VSCodeButton className="w-full mb-4" disabled={isLoginLoading} onClick={handleSignIn}>
				Sign up with Cline
				{isLoginLoading && (
					<span className="ml-1 animate-spin">
						<span className="codicon codicon-refresh" />
					</span>
				)}
			</VSCodeButton>

			<ClineAuthStatus message={authStatusMessage} />

			<p className="text-(--vscode-descriptionForeground) text-xs text-center m-0">
				By continuing, you agree to the <VSCodeLink href="https://cline.bot/tos">Terms of Service</VSCodeLink> and{" "}
				<VSCodeLink href="https://cline.bot/privacy">Privacy Policy.</VSCodeLink>
			</p>
		</div>
	)
}
