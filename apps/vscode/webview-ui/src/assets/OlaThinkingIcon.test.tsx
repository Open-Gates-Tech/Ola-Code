import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { OlaThinkingIcon } from "./OlaThinkingIcon"

describe("OlaThinkingIcon", () => {
	it("animates by default and stays decorative", () => {
		render(<OlaThinkingIcon />)
		const icon = screen.getByTestId("ola-thinking-icon")
		expect(icon).toHaveClass("ola-thinking-icon-animated")
		expect(icon).toHaveAttribute("aria-hidden", "true")
	})

	it("renders a still logo when not animated", () => {
		render(<OlaThinkingIcon animated={false} />)
		expect(screen.getByTestId("ola-thinking-icon")).not.toHaveClass("ola-thinking-icon-animated")
	})
})
