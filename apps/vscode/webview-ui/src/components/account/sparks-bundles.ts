import type { OpengatesBundleOffer, OpengatesSparksBundle, OpengatesSparksWallet } from "@shared/proto/cline/account"

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000

/** The hour in East Africa Time (UTC+3), where bundle hours are set. */
export function eatHour(now: Date): number {
	return new Date(now.getTime() + EAT_OFFSET_MS).getUTCHours()
}

export function bundleLeft(bundle: OpengatesSparksBundle): number {
	return Math.max(0, bundle.grantedNusd - bundle.usedNusd - bundle.heldNusd)
}

/** Whether a bundle can be spent at `now`: started, not expired, and inside its hours if it has any. */
export function bundleUsable(bundle: OpengatesSparksBundle, now: Date): boolean {
	const time = now.getTime()
	if (!(Date.parse(bundle.startsAt) <= time && time < Date.parse(bundle.expiresAt))) return false
	if (!bundle.windowed) return true
	const hour = eatHour(now)
	return bundle.fromHour < bundle.toHour
		? hour >= bundle.fromHour && hour < bundle.toHour
		: hour >= bundle.fromHour || hour < bundle.toHour
}

/** Bundles still worth showing (not expired, something left), soonest to expire first. */
export function liveBundles(wallet: OpengatesSparksWallet, now: Date): OpengatesSparksBundle[] {
	return wallet.bundles
		.filter((bundle) => Date.parse(bundle.expiresAt) > now.getTime() && bundleLeft(bundle) > 0)
		.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))
}

/** Bundle Sparks that can be spent right now. */
export function bundlesAvailable(wallet: OpengatesSparksWallet, now: Date): number {
	return wallet.bundles.filter((bundle) => bundleUsable(bundle, now)).reduce((total, bundle) => total + bundleLeft(bundle), 0)
}

const shillings = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 })

/** "KES 650" from 65000 cents. */
export function formatKes(cents: number): string {
	return `KES ${shillings.format(cents / 100)}`
}

/** "11 PM", "5 AM", "midnight", "noon". */
export function hourLabel(hour: number): string {
	if (hour === 0) return "midnight"
	if (hour === 12) return "noon"
	return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

/** How long an offer lasts, in a few words: "3 hours", "Until midnight", "11 PM to 5 AM", "7 days". */
export function offerValidity(offer: OpengatesBundleOffer): string {
	if (offer.topUp) return "Never expires"
	if (offer.untilMidnight) return "Until midnight"
	if (offer.windowed) return `${hourLabel(offer.fromHour)} to ${hourLabel(offer.toHour)}`
	if (offer.hours >= 48 && offer.hours % 24 === 0) return `${offer.hours / 24} days`
	return offer.hours === 1 ? "1 hour" : `${offer.hours} hours`
}

/** Time left on a bundle, roughly: "45 min left", "5 hours left", "6 days left". */
export function timeLeft(expiresAt: string, now: Date): string {
	const minutes = Math.max(0, Math.floor((Date.parse(expiresAt) - now.getTime()) / 60_000))
	if (minutes < 60) return `${minutes} min left`
	const hours = Math.floor(minutes / 60)
	if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} left`
	return `${Math.floor(hours / 24)} days left`
}
