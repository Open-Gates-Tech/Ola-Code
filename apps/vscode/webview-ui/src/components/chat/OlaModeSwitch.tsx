import { cn } from "@/lib/utils"

export type OlaMode = "interactive" | "plan" | "act"

export const OLA_MODES: { value: OlaMode; label: string; description: string }[] = [
	{
		value: "interactive",
		label: "Interactive",
		description: "Ola asks clarifying questions and confirms its approach before making changes",
	},
	{ value: "plan", label: "Plan", description: "Ola gathers information and architects a plan without making changes" },
	{ value: "act", label: "Agent", description: "Ola works on the task autonomously" },
]

export function nextOlaMode(mode: OlaMode): OlaMode {
	const index = OLA_MODES.findIndex((option) => option.value === mode)
	return OLA_MODES[(index + 1) % OLA_MODES.length].value
}

export function OlaModeSwitch({
	value,
	disabled,
	disabledReason,
	shortcut,
	onChange,
}: {
	value: OlaMode
	disabled?: boolean
	disabledReason?: string
	shortcut?: string
	onChange: (mode: OlaMode) => void
}) {
	const focusOption = (container: HTMLElement | null, mode: OlaMode) =>
		container?.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)?.focus()

	return (
		<div
			aria-disabled={disabled}
			aria-label="Mode"
			className="ola-mode-switch"
			data-testid="mode-switch"
			onKeyDown={(event) => {
				if (disabled || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return
				event.preventDefault()
				const index = OLA_MODES.findIndex((option) => option.value === value)
				const step = event.key === "ArrowRight" ? 1 : -1
				const next = OLA_MODES[(index + step + OLA_MODES.length) % OLA_MODES.length].value
				onChange(next)
				focusOption(event.currentTarget, next)
			}}
			role="radiogroup"
			title={disabled ? disabledReason : undefined}>
			{OLA_MODES.map((option) => {
				const selected = option.value === value
				return (
					<button
						aria-checked={selected}
						className={cn("ola-mode-option", selected && "ola-mode-option-selected")}
						data-mode={option.value}
						disabled={disabled}
						key={option.value}
						onClick={() => !selected && onChange(option.value)}
						role="radio"
						tabIndex={selected ? 0 : -1}
						title={`${option.description}${shortcut ? ` (switch with ${shortcut})` : ""}`}
						type="button">
						{option.label}
					</button>
				)
			})}
		</div>
	)
}
