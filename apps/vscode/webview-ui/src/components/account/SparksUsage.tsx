import type { OpengatesAccount } from "@shared/proto/cline/account"
import { BooleanRequest, StringRequest } from "@shared/proto/cline/common"
import { useState } from "react"
import { AccountServiceClient } from "@/services/grpc-client"
import { SparksBundles } from "./SparksBundles"
import { bundlesAvailable } from "./sparks-bundles"

const sparksNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 })
export function formatSparks(nusd: number): string {
	return sparksNumber.format(nusd / 1000)
}

type Props = { account: OpengatesAccount; now?: Date; onChanged?: () => void }

export function SparksUsage({ account, now = new Date(), onChanged }: Props) {
	const [checkout, setCheckout] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [renewing, setRenewing] = useState(false)
	const wallet = account.sparks
	if (!wallet) return null
	const includedAvailable = wallet.grantNusd - wallet.usedNusd - wallet.heldNusd
	const purchasedAvailable = wallet.purchasedNusd - wallet.purchasedHeldNusd
	const bundleAvailable = bundlesAvailable(wallet, now)
	const held = wallet.heldNusd + wallet.purchasedHeldNusd
	const percent = wallet.grantNusd > 0 ? Math.round((100 * includedAvailable) / wallet.grantNusd) : 0
	const startCheckout = async (id: string, subscribe = false) => {
		setCheckout(subscribe ? `${id}:monthly` : id)
		setError(null)
		try {
			const request = StringRequest.create({ value: id })
			await (subscribe
				? AccountServiceClient.startOpengatesSubscription(request)
				: AccountServiceClient.startOpengatesPlanCheckout(request))
		} catch (cause) {
			console.error("Could not start Sparks checkout:", cause)
			setError("Could not start checkout. Refresh your account and try again.")
		} finally {
			setCheckout(null)
		}
	}
	const changeRenewal = async (renew: boolean) => {
		setRenewing(true)
		setError(null)
		try {
			await AccountServiceClient.setOpengatesAutoRenew(BooleanRequest.create({ value: renew }))
			onChanged?.()
		} catch (cause) {
			console.error("Could not change renewal:", cause)
			setError("That didn't go through. Refresh your account and try again.")
		} finally {
			setRenewing(false)
		}
	}
	const subscription = account.subscription
	return (
		<div className="flex flex-col gap-4" data-testid="sparks-usage">
			{subscription && (
				<section
					aria-label="Your subscription"
					className="ola-account-card flex flex-col gap-1"
					data-moving={subscription.moving || undefined}>
					<span className="text-xs font-semibold">{subscription.title}</span>
					<span className="text-xs text-description">{subscription.detail}</span>
					{subscription.actionLabel && (
						<button
							className="ola-pill-button self-start"
							disabled={renewing}
							onClick={() => void changeRenewal(subscription.actionRenew)}
							type="button">
							{renewing ? "Saving..." : subscription.actionLabel}
						</button>
					)}
				</section>
			)}
			<div>
				<output aria-label="Available Sparks" className="block text-xl font-semibold">
					{formatSparks(includedAvailable + purchasedAvailable + bundleAvailable)} Sparks
				</output>
				<p className="m-0 mt-1 text-xs text-description">
					Available across Fast, Thinking and Pro. Models consume Sparks at their published rates.
				</p>
			</div>
			<div className="ola-usage-meter">
				<div className="flex justify-between text-xs">
					<span>{wallet.daily ? "Bure today (free)" : "Monthly included"}</span>
					<span>{percent}% available</span>
				</div>
				<div
					aria-label={wallet.daily ? "Bure Sparks left today" : "Monthly Sparks available"}
					aria-valuemax={100}
					aria-valuemin={0}
					aria-valuenow={percent}
					className="ola-usage-track"
					role="progressbar">
					<div className="ola-usage-fill" data-low={percent <= 15 || undefined} style={{ width: `${percent}%` }} />
				</div>
				<div className="text-[11px] text-description">
					{formatSparks(includedAvailable)} of {formatSparks(wallet.grantNusd)} Sparks available
				</div>
			</div>
			<dl className="ola-account-facts">
				<div>
					<dt>Included used</dt>
					<dd>{formatSparks(wallet.usedNusd)} Sparks</dd>
				</div>
				<div>
					<dt>Temporarily held</dt>
					<dd>{formatSparks(held)} Sparks</dd>
				</div>
				<div>
					<dt>Bundles available now</dt>
					<dd>{formatSparks(bundleAvailable)} Sparks</dd>
				</div>
				<div>
					<dt>Top-ups available</dt>
					<dd>{formatSparks(purchasedAvailable)} Sparks</dd>
				</div>
				<div>
					<dt>{wallet.daily ? "Bure refills" : "Included resets"}</dt>
					<dd>{wallet.daily ? "At midnight, East Africa Time" : new Date(wallet.resetAt).toLocaleString()}</dd>
				</div>
			</dl>
			<p className="m-0 text-[11px] text-description">
				{wallet.daily
					? "Bure pays for Quick and Balanced, refills every midnight, and does not carry over."
					: "Monthly included Sparks expire at reset."}{" "}
				Bundles last as long as their name says; top-ups never expire. Holds are not charges. Measured usage is charged
				even if a call is interrupted; unknown usage is not charged. Web searches use Sparks too. Sparks represent usage
				capacity, not cash.
			</p>
			{error && (
				<p className="m-0 text-xs text-error" role="alert">
					{error}
				</p>
			)}
			<SparksBundles
				account={account}
				checkout={checkout}
				now={now}
				onBuy={(id) => void startCheckout(id)}
				onSubscribe={(id) => void startCheckout(id, true)}
			/>
			{!account.billingEnabled && (
				<p className="m-0 text-xs text-description">Checkout is currently unavailable. No payment will be taken here.</p>
			)}
		</div>
	)
}
