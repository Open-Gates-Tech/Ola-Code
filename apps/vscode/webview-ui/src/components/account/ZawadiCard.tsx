import type { OpengatesZawadi } from "@shared/proto/cline/account"
import { CheckIcon, CopyIcon, GiftIcon } from "lucide-react"
import { useState } from "react"

const fullSparks = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

/** Zawadi in the Sparks view: the person's invite link, ways to share it, and how their invites are doing. */
export function ZawadiCard({ zawadi }: { zawadi: OpengatesZawadi }) {
	const [copied, setCopied] = useState(false)
	const reward = `${fullSparks.format(zawadi.rewardSparks)} Sparks`
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(zawadi.link)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			setCopied(false)
		}
	}
	const joined =
		zawadi.invited === 0
			? "No friends have joined with your link yet."
			: `${zawadi.invited} ${zawadi.invited === 1 ? "friend has" : "friends have"} joined, ${zawadi.rewarded} rewarded.`
	return (
		<section aria-label="Zawadi: invite a friend" className="ola-account-card flex flex-col gap-2" data-testid="zawadi-card">
			<span className="flex items-center gap-1.5 text-xs font-semibold">
				<GiftIcon aria-hidden="true" size={13} /> Zawadi: invite a friend
			</span>
			<span className="text-xs text-description">
				When a friend joins Ola with your link and sends {zawadi.messagesNeeded} messages, you both get {reward} for{" "}
				{zawadi.rewardDays} days.
			</span>
			<div className="flex items-center gap-2">
				<code className="min-w-0 flex-1 truncate text-xs" title={zawadi.link}>
					{zawadi.link}
				</code>
				<button
					aria-label={copied ? "Copied" : "Copy invite link"}
					className="ola-pill-button"
					onClick={() => void copy()}
					type="button">
					{copied ? <CheckIcon aria-hidden="true" size={12} /> : <CopyIcon aria-hidden="true" size={12} />}
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<a className="ola-pill-button no-underline" href={zawadi.shareUrl}>
					Share on WhatsApp
				</a>
				<a className="text-xs" href={zawadi.aboutUrl}>
					How Zawadi works
				</a>
			</div>
			<span className="text-xs text-description">
				{joined}
				{zawadi.leftThisMonth < zawadi.monthlyLimit &&
					` You can earn Zawadi for ${zawadi.leftThisMonth} more ${zawadi.leftThisMonth === 1 ? "friend" : "friends"} this month.`}
			</span>
			{zawadi.invitedByState && (
				<span className="text-xs text-description">
					{zawadi.invitedByState === "rewarded"
						? "You joined with a friend's link, and you both got your Zawadi."
						: `You joined with a friend's link: ${Math.min(zawadi.invitedByMessages, zawadi.messagesNeeded)} of ${zawadi.messagesNeeded} messages sent toward your Zawadi.`}
				</span>
			)}
		</section>
	)
}
