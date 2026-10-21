import logoUrl from "../../../assets/icons/icon.png?inline"

export function OlaLogo({ className }: { className?: string }) {
	return (
		<img
			alt="Ola"
			className={className}
			height={56}
			src={logoUrl}
			style={{
				display: "inline-block",
				flexShrink: 0,
				objectFit: "contain",
			}}
			width={56}
		/>
	)
}
