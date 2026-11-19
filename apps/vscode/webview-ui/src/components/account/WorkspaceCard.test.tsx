import { OpengatesTeamSparks, OpengatesWorkspace } from "@shared/proto/cline/account"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { WorkspaceCard } from "./WorkspaceCard"

const mocks = vi.hoisted(() => ({ chooseOlaWorkspace: vi.fn() }))
vi.mock("@/services/grpc-client", () => ({ AccountServiceClient: mocks }))

const workspace = (team?: Partial<OpengatesTeamSparks>, role = "member") =>
	OpengatesWorkspace.create({
		id: "0123456789abcdef01234567",
		name: "Sir Africa",
		role,
		sparksUrl: "https://ola.opengates.app/s/sirafrica/sparks",
		team: team ? OpengatesTeamSparks.create({ enabled: true, ...team }) : undefined,
	})

describe("WorkspaceCard", () => {
	it("says Ola Code works in the personal workspace and lets the person change it", async () => {
		mocks.chooseOlaWorkspace.mockResolvedValue({})
		const changed = vi.fn()
		render(<WorkspaceCard onChanged={changed} />)
		expect(screen.getByText("your personal workspace")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Change" }))
		await waitFor(() => expect(changed).toHaveBeenCalled())
		expect(mocks.chooseOlaWorkspace).toHaveBeenCalled()
	})

	it("shows a member what the organisation gives them this month", () => {
		render(
			<WorkspaceCard
				onChanged={vi.fn()}
				workspace={workspace({
					limited: true,
					limit: 50000,
					extra: 10000,
					used: 12000,
					remaining: 48000,
					pending: 20000,
				})}
			/>,
		)
		expect(screen.getByTestId("team-sparks").textContent).toBe(
			"Sir Africa pays for your work here: 12,000 of 60,000 Sparks used this month, 48,000 left.",
		)
		expect(screen.getByText("You asked for 20,000 more Sparks.")).toBeTruthy()
		expect(screen.getByRole("link", { name: /Ask for more/ }).getAttribute("href")).toBe(
			"https://ola.opengates.app/s/sirafrica/sparks",
		)
	})

	it("tells a member when the organisation doesn't pay, and the owner where to manage it", () => {
		const { unmount } = render(<WorkspaceCard onChanged={vi.fn()} workspace={workspace({ enabled: false })} />)
		expect(screen.getByText("Your own Sparks pay for your work here.")).toBeTruthy()
		unmount()
		render(<WorkspaceCard onChanged={vi.fn()} workspace={workspace(undefined, "owner")} />)
		expect(screen.getByRole("link", { name: /Manage your team's Sparks/ })).toBeTruthy()
	})
})
