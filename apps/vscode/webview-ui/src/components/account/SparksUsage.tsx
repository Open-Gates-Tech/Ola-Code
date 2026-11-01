import type { OpengatesAccount } from "@shared/proto/cline/account"
import { StringRequest } from "@shared/proto/cline/common"
import { useState } from "react"
import { AccountServiceClient } from "@/services/grpc-client"

const sparksNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 })
export function formatSparks(nusd: number): string {
	return sparksNumber.format(nusd / 1000)
}

const PLAN_CONTRACT = [
	{ tier: "free", name: "Free", price: 0, sparks: "200,000" },
	{ tier: "pro", name: "Pro", price: 5, sparks: "5,000,000" },
	{ tier: "ultra", name: "Ultra", price: 15, sparks: "15,000,000" },
	{ tier: "ultra_plus", name: "Ultra Plus", price: 30, sparks: "30,000,000" },
]

export function SparksUsage({ account }: { account: OpengatesAccount }) {
	const [checkout, setCheckout] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const wallet = account.sparks
	if (!wallet) return null
	const includedAvailable = wallet.grantNusd - wallet.usedNusd - wallet.heldNusd
	const purchasedAvailable = wallet.purchasedNusd - wallet.purchasedHeldNusd
	const held = wallet.heldNusd + wallet.purchasedHeldNusd
	const percent = wallet.grantNusd > 0 ? Math.round((100 * includedAvailable) / wallet.grantNusd) : 0
	const startCheckout = async (id: string) => {
		setCheckout(id)
		setError(null)
		try {
			await AccountServiceClient.startOpengatesPlanCheckout(StringRequest.create({ value: id }))
		} catch (cause) {
			console.error("Could not start Sparks plan checkout:", cause)
			setError("Could not start checkout. Refresh your account and try again.")
		} finally {
			setCheckout(null)
		}
	}
	return (
		<div className="flex flex-col gap-4" data-testid="sparks-usage">
			<div>
				<output aria-label="Available Sparks" className="block text-xl font-semibold">
					{formatSparks(includedAvailable + purchasedAvailable)} Sparks
				</output>
				<p className="m-0 mt-1 text-xs text-description">
					Available across Fast, Thinking and Pro. Models consume Sparks at their published rates.
				</p>
			</div>
			<div className="ola-usage-meter">
				<div className="flex justify-between text-xs">
					<span>Monthly included</span>
					<span>{percent}% available</span>
				</div>
				<div
					aria-label="Monthly Sparks available"
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
					<dt>Purchased available</dt>
					<dd>{formatSparks(purchasedAvailable)} Sparks</dd>
				</div>
				<div>
					<dt>Included resets</dt>
					<dd>{new Date(wallet.resetAt).toLocaleString()}</dd>
				</div>
			</dl>
			<p className="m-0 text-[11px] text-description">
				Monthly included Sparks expire at reset. Purchased Sparks do not expire with the month. Holds are not charges.
				Measured usage is charged even if a call is interrupted; unknown usage is not charged. Sparks represent model
				usage capacity, not cash. External tool and search costs are covered by Ola.
			</p>
			<details>
				<summary className="cursor-pointer text-xs font-semibold">Plans and monthly Sparks</summary>
				<div className="mt-3 flex flex-col gap-2">
					{PLAN_CONTRACT.map((plan) => {
						const product = account.products.find((p) => p.tier === plan.tier && p.billingVersion === wallet.version)
						const current = account.tier === plan.tier
						return (
							<div className="ola-account-card flex flex-col gap-1" key={plan.tier}>
								<div className="flex justify-between text-xs font-semibold">
									<span>
										{plan.name}
										{current ? " - current" : ""}
									</span>
									<span>{plan.price === 0 ? "Free" : `USD ${plan.price}/month`}</span>
								</div>
								<span className="text-xs text-description">{plan.sparks} included Sparks/month</span>
								{product && !current && (
									<button
										className="ola-pill-button self-start"
										disabled={!account.billingEnabled || checkout !== null || account.status !== "active"}
										onClick={() => void startCheckout(product.id)}
										type="button">
										{checkout === product.id ? "Opening checkout..." : `Choose ${plan.name}`}
									</button>
								)}
							</div>
						)
					})}
					{!account.billingEnabled && (
						<p className="m-0 text-xs text-description">
							Checkout is currently unavailable. No payment will be taken here.
						</p>
					)}
					<p className="m-0 text-[11px] text-description">
						Subscriptions are priced in USD. Available payment channels and any conversion are confirmed at checkout.
					</p>
					{error && (
						<p className="m-0 text-xs text-error" role="alert">
							{error}
						</p>
					)}
				</div>
			</details>
		</div>
	)
}
