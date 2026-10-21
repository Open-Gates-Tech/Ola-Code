import { cn } from "@/lib/utils"

// Same geometry as assets/icons/icon.svg: the ring is redrawn as a stroked circle
// (outer r 41.5, inner r 34.387) so its arc can spin while Ola is thinking.
const RING_RADIUS = 37.94
const RING_WIDTH = 7.113
const SMILE_PATH =
	"M3.34642 29.79C3.28296 29.8104 3.2194 29.8308 3.15595 29.8512C1.94711 30.2392 1.24121 31.5483 1.70441 32.7304C3.25698 36.6926 5.8052 40.1492 9.09124 42.7144C12.9661 45.7392 17.6605 47.3633 22.4778 47.3456C27.2951 47.3279 31.9787 45.6694 35.8336 42.6162C39.1029 40.0269 41.6284 36.5514 43.1548 32.5777C43.6101 31.3925 42.8953 30.0888 41.6837 29.7095C41.6205 29.6897 41.5571 29.6699 41.4938 29.6501C40.2822 29.2708 39.0351 29.9617 38.5498 31.1349C37.3347 34.0719 35.4173 36.6407 32.9705 38.5787C29.9372 40.9812 26.2518 42.2862 22.4612 42.3001C18.6706 42.3141 14.9768 41.0361 11.9278 38.656C9.46837 36.7361 7.53421 34.1816 6.29988 31.2538C5.80667 30.0839 4.55525 29.4019 3.34642 29.79Z"

export function OlaThinkingIcon({ animated = true, className }: { animated?: boolean; className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={cn("ola-thinking-icon", animated && "ola-thinking-icon-animated", className)}
			data-testid="ola-thinking-icon"
			fill="none"
			viewBox="0 0 83 83"
			xmlns="http://www.w3.org/2000/svg">
			<circle
				className="ola-thinking-track"
				cx="41.5"
				cy="41.5"
				r={RING_RADIUS}
				stroke="currentColor"
				strokeWidth={RING_WIDTH}
			/>
			<circle
				className="ola-thinking-ring"
				cx="41.5"
				cy="41.5"
				pathLength={100}
				r={RING_RADIUS}
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth={RING_WIDTH}
			/>
			<g transform="translate(20 21)">
				<path className="ola-thinking-smile" d={SMILE_PATH} fill="currentColor" fillRule="evenodd" />
			</g>
		</svg>
	)
}
