import type { ClineUser } from "@/context/ClineAuthContext"

export function getOlaFirstName(user: Pick<ClineUser, "displayName" | "email"> | null | undefined): string | undefined {
	const fromName = user?.displayName?.trim().split(/\s+/)[0]
	if (fromName) {
		return fromName
	}
	// Fall back to the email local part, e.g. "jane.doe@x.com" -> "Jane".
	const local = user?.email?.split("@")[0]?.split(/[._+-]/)[0]
	return local ? local.charAt(0).toUpperCase() + local.slice(1) : undefined
}

export function getOlaGreeting(firstName: string | undefined, date: Date = new Date()): string {
	const hour = date.getHours()
	const salutation = hour < 5 ? "Hello" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
	return firstName ? `${salutation}, ${firstName}` : salutation
}

export function getOlaPlaceholder(firstName: string | undefined, hasTask: boolean): string {
	if (hasTask) {
		return "Reply to Ola..."
	}
	return firstName ? `What's on your mind, ${firstName}?` : "Chat with Ola..."
}
