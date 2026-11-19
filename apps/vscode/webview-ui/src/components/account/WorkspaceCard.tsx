import type { OpengatesWorkspace } from "@shared/proto/cline/account"
import { EmptyRequest } from "@shared/proto/cline/common"
import { Building2Icon, ExternalLinkIcon } from "lucide-react"
import { useState } from "react"
import { AccountServiceClient } from "@/services/grpc-client"

const n = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

/**
 * Where Ola Code works (personal, or an organisation's workspace), with a way to change it, and in an
 * organisation what it gives this member: their Sparks this month, from what the organisation bought.
 */
export function WorkspaceCard({ workspace, onChanged }: { workspace?: OpengatesWorkspace; onChanged: () => void }) {
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const change = async () => {
		setBusy(true)
		setError(null)
		try {
			await AccountServiceClient.chooseOlaWorkspace(EmptyRequest.create())
			onChanged()
		} catch {
			setError("Your workspaces couldn't be loaded. Try again shortly.")
		} finally {
			setBusy(false)
		}
	}
	const team = workspace?.team
	return (
		<section aria-label="Workspace" className="ola-account-card flex flex-col gap-2" data-testid="ola-workspace">
			<div className="flex items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-1.5 text-xs">
					<Building2Icon aria-hidden="true" size={13} />
					<span className="truncate">
						Working in <strong>{workspace ? workspace.name : "your personal workspace"}</strong>
					</span>
				</span>
				<button className="ola-pill-button" disabled={busy} onClick={() => void change()} type="button">
					{busy ? "Choosing..." : "Change"}
				</button>
			</div>
			{workspace && (
				<span className="text-xs text-description">
					New messages use {workspace.name}&apos;s skills, memory and connected apps.
				</span>
			)}
			{workspace?.role === "owner" && (
				<a className="ola-pill-button self-start no-underline" href={workspace.sparksUrl}>
					Manage your team&apos;s Sparks <ExternalLinkIcon aria-hidden="true" size={12} />
				</a>
			)}
			{team && !team.enabled && <span className="text-xs text-description">Your own Sparks pay for your work here.</span>}
			{team?.enabled && (
				<>
					<span className="text-xs text-description" data-testid="team-sparks">
						{team.limited && team.limit + team.extra === 0
							? `${workspace?.name} pays for its team's Sparks, but not for yours yet.`
							: `${workspace?.name} pays for your work here${team.limited ? `: ${n.format(team.used)} of ${n.format(team.limit + team.extra)} Sparks used this month, ${n.format(team.remaining)} left.` : `. You've used ${n.format(team.used)} Sparks this month.`}`}
					</span>
					{team.poolEmpty && (
						<span className="text-xs text-error">{workspace?.name} is out of Sparks for the team right now.</span>
					)}
					{team.pending > 0 && (
						<span className="text-xs text-description">You asked for {n.format(team.pending)} more Sparks.</span>
					)}
					<span className="text-xs text-description">
						{team.ownSparks
							? "When these run out, your own bundles and top-ups take over (not Bure)."
							: "When these run out, Ola stops until you ask for more or choose to use your own Sparks."}
					</span>
					<a className="ola-pill-button self-start no-underline" href={workspace?.sparksUrl}>
						Ask for more or change this <ExternalLinkIcon aria-hidden="true" size={12} />
					</a>
				</>
			)}
			{error && (
				<span className="text-xs text-error" role="alert">
					{error}
				</span>
			)}
		</section>
	)
}
