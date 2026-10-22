import { OPENGATES_MANAGE_ACCOUNT_URL } from "@shared/opengates-links"
import type { OpengatesAccount } from "@shared/proto/cline/account"
import { EmptyRequest } from "@shared/proto/cline/common"
import { ExternalLinkIcon, LoaderCircleIcon, LogOutIcon, RefreshCwIcon, SparklesIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ClineUser } from "@/context/ClineAuthContext"
import { AccountServiceClient } from "@/services/grpc-client"
import { formatSparks, SparksUsage } from "./SparksUsage"

const TIER_LABELS: Record<string, string> = {
	free: "Free",
	pro: "Pro",
	ultra: "Ultra",
	ultra_plus: "Ultra Plus",
	internal: "Internal",
}

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })

export function formatTier(tier: string): string {
	return TIER_LABELS[tier] ?? (tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "Free")
}

export function formatPrice(amount: number, currency: string): string {
	try {
		return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount / 100)
	} catch {
		return `${currency} ${(amount / 100).toFixed(0)}`
	}
}

function formatModelEquivalent(nusd: number | undefined): string {
	return nusd === undefined ? "Unavailable" : `${formatSparks(nusd)} Sparks equivalent`
}

function formatDate(iso: string | undefined): string | undefined {
	return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : undefined
}

function initials(user: ClineUser): string {
	const source = user.displayName?.trim() || user.email || "?"
	const parts = source.split(/\s+/).filter(Boolean)
	return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?"
}

function UsageMeter({ label, remaining, allowance }: { label: string; remaining: number; allowance: number | undefined }) {
	if (allowance === undefined) {
		return (
			<div className="ola-usage-meter">
				<div className="flex items-center justify-between text-xs">
					<span>{label}</span>
					<span className="text-description">Total unavailable</span>
				</div>
				<div className="text-[11px] text-description">
					{remaining >= 0 ? `${compact.format(remaining)} reported tokens remaining` : "Remaining unavailable"}
				</div>
			</div>
		)
	}
	if (allowance === 0) {
		return (
			<div className="ola-usage-meter" data-locked="true">
				<div className="flex items-center justify-between text-xs">
					<span>{label}</span>
					<span className="text-description">Not included</span>
				</div>
			</div>
		)
	}
	if (allowance < 0) {
		return (
			<div className="ola-usage-meter">
				<div className="flex items-center justify-between text-xs">
					<span>{label}</span>
					<span className="text-description">Unlimited</span>
				</div>
			</div>
		)
	}
	const percent = Math.round(Math.max(0, Math.min(remaining / allowance, 1)) * 100)
	return (
		<div className="ola-usage-meter">
			<div className="flex items-center justify-between text-xs">
				<span>{label}</span>
				<span className="text-description">{percent}% left</span>
			</div>
			<div
				aria-label={`${label} allowance remaining`}
				aria-valuemax={100}
				aria-valuemin={0}
				aria-valuenow={percent}
				className="ola-usage-track"
				role="progressbar">
				<div className="ola-usage-fill" data-low={percent <= 15 || undefined} style={{ width: `${percent}%` }} />
			</div>
			<div className="text-[11px] text-description">
				{compact.format(remaining)} of {compact.format(allowance)} tokens remaining
			</div>
		</div>
	)
}

export function OpengatesAccountView({ user }: { user: ClineUser }) {
	const [account, setAccount] = useState<OpengatesAccount | null>(null)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [upgrading, setUpgrading] = useState(false)
	const [upgradeError, setUpgradeError] = useState<string | null>(null)
	const [signingOut, setSigningOut] = useState(false)
	const [signOutError, setSignOutError] = useState<string | null>(null)
	const requestId = useRef(0)

	const load = useCallback(async () => {
		const id = ++requestId.current
		setLoading(true)
		setLoadError(null)
		try {
			const next = await AccountServiceClient.getOpengatesAccount(EmptyRequest.create())
			if (id === requestId.current) setAccount(next)
		} catch (error) {
			console.error("Could not load Opengates account:", error)
			if (id === requestId.current) setLoadError("Could not load your plan and usage.")
		} finally {
			if (id === requestId.current) setLoading(false)
		}
	}, [])

	useEffect(() => {
		void load()
	}, [load])

	useEffect(() => {
		if (!account?.sparks?.version || loading) return
		const timer = setInterval(() => void load(), 30_000)
		return () => clearInterval(timer)
	}, [account?.sparks?.version, loading, load])

	const upgrade = async () => {
		setUpgrading(true)
		setUpgradeError(null)
		try {
			await AccountServiceClient.startOpengatesUpgrade(EmptyRequest.create())
		} catch (error) {
			console.error("Could not start Ola Pro checkout:", error)
			setUpgradeError("Could not start checkout. Please try again.")
		} finally {
			setUpgrading(false)
		}
	}

	const signOut = async () => {
		setSigningOut(true)
		setSignOutError(null)
		try {
			await AccountServiceClient.accountLogoutClicked(EmptyRequest.create())
		} catch (error) {
			console.error("Opengates sign-out failed:", error)
			setSignOutError("Could not sign out. Please try again.")
		} finally {
			setSigningOut(false)
		}
	}

	const tier = formatTier(account?.tier ?? "")
	const resetAt = formatDate(account?.resetAt)
	const expiresAt = formatDate(account?.expiresAt)
	const inactive = account && account.status !== "active"

	return (
		<div className="flex flex-col gap-3 p-4" data-testid="opengates-account">
			<section className="ola-account-card flex items-center gap-3">
				{user.photoUrl ? (
					<img alt="" className="ola-avatar" referrerPolicy="no-referrer" src={user.photoUrl} />
				) : (
					<div aria-hidden="true" className="ola-avatar">
						{initials(user)}
					</div>
				)}
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-center gap-2">
						<h2 className="m-0 truncate text-sm font-semibold text-foreground">
							{user.displayName || "Opengates user"}
						</h2>
						{account && (
							<span className="ola-tier-badge" data-tier={account.tier}>
								{tier}
							</span>
						)}
					</div>
					{user.email && <span className="truncate text-xs text-description">{user.email}</span>}
				</div>
			</section>

			<section aria-busy={loading} className="ola-account-card flex flex-col gap-3">
				<div className="flex items-center justify-between">
					<h3 className="ola-account-heading">Usage</h3>
					<button
						aria-label="Refresh usage"
						className="ola-icon-button"
						disabled={loading}
						onClick={() => void load()}
						type="button">
						<RefreshCwIcon className={loading ? "animate-spin" : undefined} size={12} />
					</button>
				</div>
				{loadError && account && (
					<p className="m-0 text-xs text-error" role="alert">
						{loadError} Showing the last retrieved balance; refresh to retry.
					</p>
				)}
				{loading && !account ? (
					<div className="flex items-center gap-2 text-xs text-description">
						<LoaderCircleIcon className="animate-spin" size={14} /> Loading usage...
					</div>
				) : loadError && !account ? (
					<p className="m-0 text-xs text-error" role="alert">
						{loadError}
					</p>
				) : account?.sparks ? (
					<SparksUsage account={account} />
				) : account ? (
					<>
						<UsageMeter allowance={account.fastLimit} label="Fast" remaining={account.fastRemaining} />
						<UsageMeter allowance={account.reasonLimit} label="Thinking & Pro" remaining={account.reasonRemaining} />
						<p className="m-0 text-[11px] text-description">
							Server-reported raw-token balances, not Standard/Premium budgets.
						</p>
						<dl className="ola-account-facts">
							<div>
								<dt>Credits</dt>
								<dd>{account.creditsRemaining.toLocaleString()}</dd>
							</div>
							{resetAt && (
								<div>
									<dt>Resets</dt>
									<dd>{resetAt}</dd>
								</div>
							)}
						</dl>
					</>
				) : null}
			</section>

			{!account?.sparks && account?.agentBudgetTask?.mode === "shadow" && (
				<section className="ola-account-card flex flex-col gap-3" data-testid="opengates-agent-budget">
					<div>
						<h3 className="ola-account-heading">Shadow evaluation</h3>
						<p className="m-0 mt-1 text-[11px] text-description">
							Evaluation only — shadow grants are not active budgets. These figures are non-enforcing and do not
							consume customer usage.
						</p>
					</div>
					<dl className="ola-account-facts">
						<div>
							<dt>Task</dt>
							<dd>
								{account.agentBudgetTask.preset || "Evaluation"} · {account.agentBudgetTask.id}
							</dd>
						</div>
						<div>
							<dt>Task cap</dt>
							<dd>{formatModelEquivalent(account.agentBudgetTask.capNusd)}</dd>
						</div>
						<div>
							<dt>Shadow usage / held</dt>
							<dd>
								{formatModelEquivalent(account.agentBudgetTask.shadowUsedNusd)} /{" "}
								{formatModelEquivalent(account.agentBudgetTask.shadowHeldNusd)}
							</dd>
						</div>
						<div>
							<dt>Iterations</dt>
							<dd>
								{account.agentBudgetTask.iterations ?? "Unavailable"} /{" "}
								{account.agentBudgetTask.maxIterations ?? "Unavailable"}
							</dd>
						</div>
						<div>
							<dt>Premium evaluation consent</dt>
							<dd>{account.agentBudgetTask.premiumAuthorized ? "Granted for this task" : "Not granted"}</dd>
						</div>
					</dl>
					{(["standard", "premium"] as const).map((pool) => {
						const balance = account.agentBudgetTask?.[pool]
						return (
							<div className="ola-usage-meter" key={pool}>
								<div className="flex items-center justify-between text-xs">
									<span>{pool === "standard" ? "Standard" : "Premium"} shadow evaluation grant</span>
									<span className="text-description">Server-reported</span>
								</div>
								<div className="text-[11px] text-description">
									{balance
										? `${formatModelEquivalent(balance.grantNusd)} grant; ${formatModelEquivalent(balance.availableNusd)} remaining; ${formatModelEquivalent(balance.heldNusd)} held`
										: "Grant, remaining, and held totals unavailable from the server"}
								</div>
							</div>
						)
					})}
					{account.agentBudgetTask.riskDependencyMissing && (
						<p className="m-0 text-[11px] text-description">
							Provider-risk dependency is missing; no independent provider-risk cap is enforced.
						</p>
					)}
				</section>
			)}

			{account && (
				<section className="ola-account-card flex flex-col gap-2">
					<h3 className="ola-account-heading">Plan</h3>
					<dl className="ola-account-facts">
						<div>
							<dt>Plan</dt>
							<dd>Ola {tier}</dd>
						</div>
						<div>
							<dt>Status</dt>
							<dd className={inactive ? "text-error" : undefined}>
								{account.status ? account.status.charAt(0).toUpperCase() + account.status.slice(1) : "Unknown"}
							</dd>
						</div>
						{expiresAt && account.tier !== "free" && (
							<div>
								<dt>Expires</dt>
								<dd>{expiresAt}</dd>
							</div>
						)}
					</dl>
				</section>
			)}

			{!account?.sparks && account?.upgradeProduct && (
				<section className="ola-account-card ola-upgrade-card flex flex-col gap-2" data-testid="opengates-upgrade">
					<div className="flex items-center gap-2">
						<SparklesIcon aria-hidden="true" size={14} />
						<h3 className="m-0 text-sm font-semibold">Upgrade to Ola Pro</h3>
					</div>
					<p className="m-0 text-xs text-description">
						Unlock Thinking and Pro models with a much larger monthly allowance.
					</p>
					<button
						className="ola-pill-button self-start"
						data-variant="primary"
						disabled={upgrading}
						onClick={() => void upgrade()}
						type="button">
						{upgrading && <LoaderCircleIcon className="animate-spin" size={12} />}
						Upgrade for {formatPrice(account.upgradeProduct.amount, account.upgradeProduct.currency)}
						{account.upgradeProduct.days > 0 && ` / ${account.upgradeProduct.days} days`}
					</button>
					{upgradeError && (
						<p className="m-0 text-xs text-error" role="alert">
							{upgradeError}
						</p>
					)}
				</section>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<a className="ola-pill-button no-underline" href={OPENGATES_MANAGE_ACCOUNT_URL}>
					Manage account <ExternalLinkIcon aria-hidden="true" size={12} />
				</a>
				<button className="ola-pill-button" disabled={signingOut} onClick={() => void signOut()} type="button">
					<LogOutIcon aria-hidden="true" size={12} /> Sign out
				</button>
			</div>
			{signOutError && (
				<p className="m-0 text-xs text-error" role="alert">
					{signOutError}
				</p>
			)}
		</div>
	)
}
