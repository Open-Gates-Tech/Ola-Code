import { render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import logoUrl from "../../../assets/icons/icon.png?inline"
import { OlaLogo } from "./OlaLogo"

it("shows the original Ola PNG with an accessible name and the greeting logo dimensions", () => {
	render(<OlaLogo />)
	const logo = screen.getByRole("img", { name: "Ola" })
	expect(logo).toHaveAttribute("src", logoUrl)
	expect(logoUrl).toMatch(/^data:image\/png;base64,/)
	expect(logo).toHaveAttribute("width", "56")
	expect(logo).toHaveAttribute("height", "56")
	expect(logo).toHaveStyle({ objectFit: "contain" })
})
