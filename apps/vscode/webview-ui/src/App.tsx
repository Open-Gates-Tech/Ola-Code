import type { Boolean, EmptyRequest } from "@shared/proto/cline/common"
import { useCallback, useEffect, useState } from "react"
import AccountView from "./components/account/AccountView"
import { AccountWelcomeView } from "./components/account/AccountWelcomeView"
import ChatView from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import MarketplaceView from "./components/marketplace/MarketplaceView"
import McpView from "./components/mcp/configuration/McpConfigurationView"
import { openClinePassSubscriptionIfPending } from "./components/onboarding/clinePassSubscribe"
import OnboardingView from "./components/onboarding/OnboardingView"
import SettingsView from "./components/settings/SettingsView"
import WorktreesView from "./components/worktrees/WorktreesView"
import { useClineAuth } from "./context/ClineAuthContext"
import { useExtensionState } from "./context/ExtensionStateContext"
import { Providers } from "./Providers"
import { UiServiceClient } from "./services/grpc-client"

const AppContent = () => {
	const {
		didHydrateState,
		opengatesAuthEnabled,
		showWelcome,
		shouldShowAnnouncement,
		showMarketplace,
		showMcp,
		mcpTab,
		showSettings,
		settingsNavigationRequest,
		showHistory,
		showAccount,
		showWorktrees,
		showAnnouncement,
		setShowAnnouncement,
		setShouldShowAnnouncement,
		closeMcpView,
		navigateToHistory,
		hideSettings,
		hideHistory,
		hideAccount,
		hideWorktrees,
		closeMarketplaceView,
		hideAnnouncement,
	} = useExtensionState()

	const { clineUser, isAuthReady, authError, organizations, activeOrganization, accountSwitch, accountSwitchError } =
		useClineAuth()
	const [hasOpenedChat, setHasOpenedChat] = useState(false)

	useEffect(() => {
		if (clineUser) setHasOpenedChat(true)
	}, [clineUser])

	const showUpdateAnnouncementModal = useCallback(() => {
		setShowAnnouncement(true)
		UiServiceClient.onDidShowAnnouncement({} as EmptyRequest)
			.then((response: Boolean) => {
				setShouldShowAnnouncement(response.value)
			})
			.catch((error) => {
				console.error("Failed to acknowledge announcement:", error)
			})
	}, [setShouldShowAnnouncement, setShowAnnouncement])

	useEffect(() => {
		if (opengatesAuthEnabled || !didHydrateState || showWelcome || !shouldShowAnnouncement || showAnnouncement) {
			return
		}
		showUpdateAnnouncementModal()
	}, [
		opengatesAuthEnabled,
		didHydrateState,
		showWelcome,
		shouldShowAnnouncement,
		showAnnouncement,
		showUpdateAnnouncementModal,
	])

	// Open the ClinePass subscription page once auth completes. Lives here (not in OnboardingView)
	// because handleAuthCallback unmounts onboarding before the clineUser update arrives.
	useEffect(() => {
		if (clineUser?.uid && !opengatesAuthEnabled) {
			openClinePassSubscriptionIfPending(clineUser.appBaseUrl)
		}
	}, [clineUser?.uid, clineUser?.appBaseUrl, opengatesAuthEnabled])

	if (!didHydrateState) {
		return null
	}

	const authGate =
		opengatesAuthEnabled &&
		(!isAuthReady ? (
			<output className="p-5">Restoring your Opengates session...</output>
		) : !clineUser || authError ? (
			<div>
				{authError && (
					<p className="p-5" role="alert">
						{authError}
					</p>
				)}
				<AccountWelcomeView />
			</div>
		) : null)

	if (authGate && !hasOpenedChat) return authGate

	if (showWelcome && !opengatesAuthEnabled) {
		return <OnboardingView />
	}

	return (
		<div className="flex h-screen w-full flex-col">
			{authGate}
			<div className={authGate ? "hidden" : "contents"}>
				{(accountSwitch || accountSwitchError) && !showAccount && (
					<output className="z-50 bg-editor-background p-2 text-xs">
						{accountSwitch
							? accountSwitch.slow
								? "Account switch is still pending. You can navigate while it finishes."
								: "Switching account…"
							: `Could not confirm account switch: ${accountSwitchError}`}
					</output>
				)}
				{!opengatesAuthEnabled && showSettings && (
					<SettingsView navigationRequest={settingsNavigationRequest} onDone={hideSettings} />
				)}
				{showHistory && <HistoryView onDone={hideHistory} />}
				{!opengatesAuthEnabled && showMarketplace && (
					<MarketplaceView initialType={mcpTab ? "mcp" : undefined} onDone={closeMarketplaceView} />
				)}
				{opengatesAuthEnabled && showMarketplace && <McpView initialTab={mcpTab} onDone={closeMarketplaceView} />}
				{showMcp && <McpView initialTab={mcpTab} onDone={closeMcpView} />}
				{showAccount && (
					<AccountView
						activeOrganization={activeOrganization}
						clineUser={clineUser}
						onDone={hideAccount}
						organizations={organizations}
					/>
				)}
				{showWorktrees && <WorktreesView onDone={hideWorktrees} />}
				{/* Do not conditionally load ChatView, it's expensive and there's state we don't want to lose (user input, disableInput, askResponse promise, etc.) */}
				<ChatView
					hideAnnouncement={hideAnnouncement}
					isHidden={
						!!authGate ||
						(!opengatesAuthEnabled && showSettings) ||
						showHistory ||
						showMarketplace ||
						showMcp ||
						showAccount ||
						showWorktrees
					}
					showAnnouncement={showAnnouncement}
					showHistoryView={navigateToHistory}
				/>
			</div>
		</div>
	)
}

const App = () => {
	return (
		<Providers>
			<AppContent />
		</Providers>
	)
}

export default App
