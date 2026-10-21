import { describe, expect, it } from "vitest"
import { getOlaFirstName, getOlaGreeting, getOlaPlaceholder } from "./ola-greeting"

describe("Ola greeting", () => {
	it("uses the first word of the display name", () => {
		expect(getOlaFirstName({ displayName: "  Ramadhani Mussa ", email: "r@x.com" })).toBe("Ramadhani")
	})

	it("falls back to the email local part", () => {
		expect(getOlaFirstName({ email: "jane.doe@example.com" })).toBe("Jane")
		expect(getOlaFirstName(null)).toBeUndefined()
	})

	it("greets by time of day", () => {
		expect(getOlaGreeting("Jane", new Date(2026, 0, 1, 9))).toBe("Good morning, Jane")
		expect(getOlaGreeting("Jane", new Date(2026, 0, 1, 14))).toBe("Good afternoon, Jane")
		expect(getOlaGreeting(undefined, new Date(2026, 0, 1, 20))).toBe("Good evening")
	})

	it("personalizes the input placeholder", () => {
		expect(getOlaPlaceholder("Jane", false)).toBe("What's on your mind, Jane?")
		expect(getOlaPlaceholder(undefined, false)).toBe("Chat with Ola...")
		expect(getOlaPlaceholder("Jane", true)).toBe("Reply to Ola...")
	})
})
