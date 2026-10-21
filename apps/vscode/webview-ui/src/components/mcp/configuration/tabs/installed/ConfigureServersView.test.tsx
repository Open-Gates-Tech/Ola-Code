import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ConfigureServersView from "./ConfigureServersView"

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({ opengatesAuthEnabled: true, mcpServers: [] }),
}))
vi.mock("./ServersToggleList", () => ({ default: () => null }))
vi.mock("@/services/grpc-client", () => ({ McpServiceClient: {} }))

describe("Ola MCP configuration", () => {
	it("keeps server configuration without linking to the removed settings screen", () => {
		render(<ConfigureServersView />)
		expect(screen.getByText("Connect MCP servers to give Ola access to additional tools.")).toBeVisible()
		expect(screen.getByText("Configure MCP Servers")).toBeVisible()
		expect(screen.queryByText("Advanced MCP Settings")).not.toBeInTheDocument()
	})
})
