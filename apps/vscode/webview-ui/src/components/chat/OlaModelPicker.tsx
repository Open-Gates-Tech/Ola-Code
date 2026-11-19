import { OPENGATES_MODELS, resolveOpengatesModel } from "@shared/opengates-models"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import type React from "react"
import { useEffect, useId, useRef, useState } from "react"
import { useApiConfigurationHandlers } from "@/components/settings/utils/useApiConfigurationHandlers"
import { useExtensionState } from "@/context/ExtensionStateContext"

const MODEL_DESCRIPTIONS: Record<string, string> = {
	"ola-code-fast": "Quick answers and everyday edits",
	"ola-code-reason": "Reasoning for most coding work",
	"ola-code-pro": "Most capable models for the hardest problems",
}

const MENU_ITEMS = OPENGATES_MODELS.map(({ id, label }) => ({ id, label, description: MODEL_DESCRIPTIONS[id] }))

export function OlaModelPicker() {
	const { apiConfiguration, mode } = useExtensionState()
	const { handleFieldsChange } = useApiConfigurationHandlers()
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [open, setOpen] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const menuId = useId()
	const selectedId = resolveOpengatesModel(apiConfiguration, mode)
	const selectedLabel = MENU_ITEMS.find(({ id }) => id === selectedId)?.label ?? selectedId

	useEffect(() => {
		if (!open) {
			return
		}
		const handlePointerDown = (event: MouseEvent) => {
			if (!containerRef.current?.contains(event.target as Node)) {
				setOpen(false)
			}
		}
		document.addEventListener("mousedown", handlePointerDown)
		return () => document.removeEventListener("mousedown", handlePointerDown)
	}, [open])

	const selectModel = async (modelId: string) => {
		setOpen(false)
		triggerRef.current?.focus()
		if (modelId === selectedId) {
			return
		}
		setSaving(true)
		setError(null)
		try {
			await handleFieldsChange({
				planModeApiProvider: "openai",
				actModeApiProvider: "openai",
				planModeOpenAiModelId: modelId,
				actModeOpenAiModelId: modelId,
			})
		} catch (cause) {
			console.error("Could not change Ola model:", cause)
			setError("Could not change model. Try again.")
		} finally {
			setSaving(false)
		}
	}

	const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			// Keep Escape from reaching the global "cancel task" shortcut.
			event.preventDefault()
			event.stopPropagation()
			setOpen(false)
			triggerRef.current?.focus()
			return
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
			return
		}
		event.preventDefault()
		const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
		const index = options.indexOf(document.activeElement as HTMLButtonElement)
		const next = event.key === "ArrowDown" ? index + 1 : index - 1
		options[(next + options.length) % options.length]?.focus()
	}

	return (
		<div className="relative inline-flex items-center" ref={containerRef}>
			<button
				aria-controls={open ? menuId : undefined}
				aria-expanded={open}
				aria-haspopup="listbox"
				aria-label="Model"
				className="ola-model-trigger"
				data-value={selectedId}
				disabled={saving}
				onClick={() => setOpen((current) => !current)}
				onKeyDown={(event) => {
					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault()
						setOpen(true)
					}
				}}
				ref={triggerRef}
				type="button">
				<span className="truncate">{selectedLabel}</span>
				<ChevronDownIcon aria-hidden="true" className={open ? "rotate-180" : undefined} size={12} />
			</button>
			{open && (
				<div
					aria-label="Model"
					className="ola-model-menu"
					id={menuId}
					onKeyDown={handleMenuKeyDown}
					ref={(menu) => {
						menu?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
					}}
					role="listbox">
					<div className="ola-model-menu-heading">Model</div>
					{MENU_ITEMS.map(({ id, label, description }) => {
						const selected = id === selectedId
						return (
							<button
								aria-selected={selected}
								className="ola-model-option"
								key={id}
								onClick={() => void selectModel(id)}
								role="option"
								type="button">
								<span className="flex min-w-0 flex-col items-start">
									<span className="text-xs">{label}</span>
									{description && <span className="ola-model-option-description">{description}</span>}
								</span>
								{selected && <CheckIcon aria-hidden="true" className="shrink-0" size={14} />}
							</button>
						)
					})}
				</div>
			)}
			{error && (
				<p className="absolute bottom-full left-0 mb-1 whitespace-nowrap text-xs text-error" role="alert">
					{error}
				</p>
			)}
		</div>
	)
}
