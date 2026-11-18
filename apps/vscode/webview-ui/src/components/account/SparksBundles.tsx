import type { OpengatesAccount, OpengatesProduct } from "@shared/proto/cline/account"
import { bundleLeft, bundleUsable, formatKes, hourLabel, liveBundles, offerValidity, timeLeft } from "./sparks-bundles"

const fullSparks = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

type Props = {
	account: OpengatesAccount
	now: Date
	/** The product whose checkout is opening, if any. */
	checkout: string | null
	onBuy: (productId: string) => void
	/** Checkout for a monthly bundle that renews on the card it is paid with. */
	onSubscribe?: (productId: string) => void
}

/** Bundles still running, then bundles and top-ups to buy, priced in KES with VAT included. */
export function SparksBundles({ account, now, checkout, onBuy, onSubscribe }: Props) {
	const wallet = account.sparks
	if (!wallet) return null
	const offers = account.products.filter((p) => p.bundle)
	const names = new Map(offers.map((p) => [p.id, p.bundle?.name ?? "Bundle"]))
	const running = liveBundles(wallet, now)
	const bundles = offers.filter((p) => !p.bundle?.topUp)
	const topUps = offers.filter((p) => p.bundle?.topUp)
	const blocked = !account.billingEnabled || checkout !== null || account.status !== "active"

	const card = (product: OpengatesProduct) => {
		const offer = product.bundle
		if (!offer) return null
		const price = formatKes(product.amount)
		const closed = !product.onSale
		return (
			<div className="ola-account-card flex flex-col gap-1" key={product.id}>
				<div className="flex justify-between gap-2 text-xs font-semibold">
					<span>{offer.name}</span>
					<span>{price}</span>
				</div>
				<span className="text-xs text-description">
					{fullSparks.format(offer.sparks)} Sparks · {offerValidity(offer)}
					{offer.label && offer.label !== offerValidity(offer) ? ` · ${offer.label}` : ""}
				</span>
				<button
					aria-label={`Buy ${offer.name} for ${price}`}
					className="ola-pill-button self-start"
					disabled={blocked || closed}
					onClick={() => onBuy(product.id)}
					type="button">
					{closed
						? `Sold until ${hourLabel(offer.sellUntilHour)}`
						: checkout === product.id
							? "Opening checkout..."
							: `Buy for ${price}`}
				</button>
				{product.subscribable && onSubscribe && !closed && (
					<button
						aria-label={`Subscribe to ${offer.name} for ${price} a month`}
						className="ola-pill-button self-start"
						disabled={blocked}
						onClick={() => onSubscribe(product.id)}
						type="button">
						{checkout === `${product.id}:monthly` ? "Opening checkout..." : "Renew every month (card)"}
					</button>
				)}
			</div>
		)
	}

	return (
		<>
			{running.length > 0 && (
				<div className="flex flex-col gap-1" data-testid="running-bundles">
					<span className="text-xs font-semibold">Bundles running</span>
					<ul className="m-0 flex list-none flex-col gap-1 p-0">
						{running.map((bundle) => {
							const usable = bundleUsable(bundle, now)
							return (
								<li className="flex justify-between gap-2 text-xs" key={bundle.id}>
									<span>{names.get(bundle.product) ?? "Bundle"}</span>
									<span className="text-description">
										{fullSparks.format(bundleLeft(bundle) / 1000)} left ·{" "}
										{usable || !bundle.windowed
											? timeLeft(bundle.expiresAt, now)
											: `starts at ${hourLabel(bundle.fromHour)}`}
									</span>
								</li>
							)
						})}
					</ul>
				</div>
			)}
			{offers.length > 0 && (
				<details>
					<summary className="cursor-pointer text-xs font-semibold">Bundles and top-ups</summary>
					<div className="mt-3 flex flex-col gap-2">
						<p className="m-0 text-[11px] text-description">
							Bundles are spent before your monthly Sparks, soonest to expire first.
						</p>
						{bundles.map(card)}
						{topUps.length > 0 && (
							<p className="m-0 mt-1 text-[11px] text-description">Top-ups never expire and are spent last.</p>
						)}
						{topUps.map(card)}
						<p className="m-0 text-[11px] text-description">
							Prices are in Kenyan shillings and include VAT. Payment opens in your browser through Paystack.
						</p>
					</div>
				</details>
			)}
		</>
	)
}
