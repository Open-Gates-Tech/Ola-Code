import type {
	AgentMessage,
	AgentModel,
	AgentModelEvent,
	AgentModelRequest,
	AgentTool,
} from "@cline/shared";
import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "./index";

// Regression fixtures for streamed tool-call assembly and leaked
// chat-template tool-call markup (observed with DeepSeek "DSML" output, where
// a `run_commands` call carried `<｜DSML｜...>` markup inside its `commands`
// argument and the assistant text repeated growing prefixes of that markup).

class ScriptedModel implements AgentModel {
	public readonly requests: AgentModelRequest[] = [];

	constructor(
		private readonly steps: Array<
			(request: AgentModelRequest) => Iterable<AgentModelEvent>
		>,
	) {}

	async stream(
		request: AgentModelRequest,
	): Promise<AsyncIterable<AgentModelEvent>> {
		this.requests.push(request);
		const step = this.steps.shift();
		if (!step) {
			throw new Error("No scripted model step available");
		}
		const events = step(request);
		return (async function* () {
			yield* events;
		})();
	}
}

function createRecordingTool(name = "run_commands"): {
	tool: AgentTool<unknown, { ok: true }>;
	execute: ReturnType<typeof vi.fn>;
} {
	const execute = vi.fn(async () => ({ ok: true as const }));
	return {
		execute,
		tool: {
			name,
			description: `${name} test tool`,
			inputSchema: { type: "object" },
			execute,
		},
	};
}

const doneStep = (): AgentModelEvent[] => [
	{ type: "text-delta", text: "done" },
	{ type: "finish", reason: "stop" },
];

const DSML_TEXT =
	'<｜DSML｜tool_calls>\n<｜DSML｜invoke name="run_commands">\n<｜DSML｜parameter name="commands" string="false">ls -la "c:/Users/project"</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>';

function toolResults(messages: AgentMessage[]) {
	return messages
		.filter((message) => message.role === "tool")
		.flatMap((message) => message.content)
		.filter((part) => part.type === "tool-result");
}

describe("AgentRuntime streamed tool-call assembly", () => {
	it.each([
		{
			name: "delta chunk that starts a nested array",
			chunks: ['{"commands":', '["ls -la"]}'],
			expected: { commands: ["ls -la"] },
		},
		{
			name: "delta chunk that starts a nested object",
			chunks: ['{"opts":', '{"x":1},"y":', "[2]}"],
			expected: { opts: { x: 1 }, y: [2] },
		},
		{
			name: "cumulative snapshots",
			chunks: ['{"commands":', '{"commands":["ls', '{"commands":["ls"]}'],
			expected: { commands: ["ls"] },
		},
		{
			name: "repeated final snapshot",
			chunks: ['{"commands":["ls"]}', '{"commands":["ls"]}'],
			expected: { commands: ["ls"] },
		},
		{
			name: "deltas followed by the full snapshot",
			chunks: ['{"commands":', '["ls"]}', '{"commands":["ls"]}'],
			expected: { commands: ["ls"] },
		},
		{
			name: "stale shorter snapshot after the full snapshot",
			chunks: ['{"commands":["ls"]}', '{"commands":'],
			expected: { commands: ["ls"] },
		},
	])("assembles $name into exactly one call", async ({ chunks, expected }) => {
		const { tool, execute } = createRecordingTool();
		const model = new ScriptedModel([
			() => [
				...chunks.map(
					(inputText): AgentModelEvent => ({
						type: "tool-call-delta",
						toolCallId: "call_1",
						toolName: "run_commands",
						inputText,
					}),
				),
				{ type: "finish", reason: "tool-calls" },
			],
			doneStep,
		]);
		const runtime = new AgentRuntime({ model, tools: [tool] });

		const result = await runtime.run("Start");

		expect(result.status).toBe("completed");
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledWith(expected, expect.anything());
	});
});

describe("AgentRuntime leaked tool-call protocol markup", () => {
	it("executes a well-formed structured call whose arguments contain DSML literals", async () => {
		const { tool, execute } = createRecordingTool("write_to_file");
		const input = { path: "docs/deepseek-template.md", content: DSML_TEXT };
		const model = new ScriptedModel([
			() => [
				{
					type: "tool-call-delta",
					toolCallId: "call_doc",
					toolName: "write_to_file",
					input,
				},
				{ type: "finish", reason: "tool-calls" },
			],
			doneStep,
		]);
		const runtime = new AgentRuntime({ model, tools: [tool] });

		const result = await runtime.run("Document the DeepSeek template");

		expect(result.status).toBe("completed");
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledWith(input, expect.anything());
		const assistant = result.messages.find(
			(message) => message.role === "assistant",
		);
		expect(assistant?.metadata?.invalidToolCalls).toBeUndefined();
	});

	it("executes DSML literals assembled from streamed argument text", async () => {
		const { tool, execute } = createRecordingTool("write_to_file");
		const input = { path: "src/tokens.ts", content: DSML_TEXT };
		const argsText = JSON.stringify(input);
		const model = new ScriptedModel([
			() => [
				{
					type: "tool-call-delta",
					toolCallId: "call_doc",
					toolName: "write_to_file",
					inputText: argsText.slice(0, 20),
				},
				{
					type: "tool-call-delta",
					toolCallId: "call_doc",
					toolName: "write_to_file",
					inputText: argsText.slice(20),
				},
				{ type: "finish", reason: "tool-calls" },
			],
			doneStep,
		]);
		const runtime = new AgentRuntime({ model, tools: [tool] });

		const result = await runtime.run("Start");

		expect(result.status).toBe("completed");
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledWith(input, expect.anything());
	});

	it("never executes a call whose argument protocol is malformed", async () => {
		const { tool, execute } = createRecordingTool();
		const model = new ScriptedModel([
			() => [
				{
					type: "tool-call-delta",
					toolCallId: "call_bad",
					toolName: "run_commands",
					// Raw template markup where the JSON arguments should be.
					inputText: `{"commands": ${DSML_TEXT}`,
				},
				{ type: "finish", reason: "tool-calls" },
			],
			(request) => {
				const toolResult = request.messages.at(-1)?.content[0];
				expect(toolResult).toMatchObject({
					type: "tool-result",
					toolName: "run_commands",
					isError: true,
				});
				return doneStep();
			},
		]);
		const runtime = new AgentRuntime({ model, tools: [tool] });

		const result = await runtime.run("Start");

		expect(execute).not.toHaveBeenCalled();
		expect(result.status).toBe("completed");
		const assistant = result.messages.find(
			(message) => message.role === "assistant",
		);
		expect(assistant?.metadata?.invalidToolCalls).toEqual([
			expect.objectContaining({
				toolCallId: "call_bad",
				reason: "invalid_arguments",
			}),
		]);
		expect(toolResults(result.messages)).toEqual([
			expect.objectContaining({ isError: true }),
		]);
	});

	it("does not reject ordinary arguments that mention pipes or angle brackets", async () => {
		const { tool, execute } = createRecordingTool();
		const model = new ScriptedModel([
			() => [
				{
					type: "tool-call-delta",
					toolCallId: "call_ok",
					toolName: "run_commands",
					input: { commands: ["echo '<|a|>' | grep a > out.txt"] },
				},
				{ type: "finish", reason: "tool-calls" },
			],
			doneStep,
		]);
		const runtime = new AgentRuntime({ model, tools: [tool] });

		const result = await runtime.run("Start");

		expect(result.status).toBe("completed");
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it("continues with a corrective reminder when tool-call markup leaks into text, without executing it", async () => {
		const { tool, execute } = createRecordingTool();
		const model = new ScriptedModel([
			() => [
				{ type: "text-delta", text: `Listing files.\n${DSML_TEXT}` },
				{ type: "finish", reason: "stop" },
			],
			(request) => {
				const last = request.messages.at(-1);
				expect(last?.role).toBe("user");
				expect(JSON.stringify(last?.content)).toContain(
					"structured tool-calling",
				);
				return [
					{
						type: "tool-call-delta",
						toolCallId: "call_ok",
						toolName: "run_commands",
						input: { commands: ["ls -la"] },
					},
					{ type: "finish", reason: "tool-calls" },
				];
			},
			doneStep,
		]);
		const runtime = new AgentRuntime({ model, tools: [tool] });

		const result = await runtime.run("Start");

		expect(result.status).toBe("completed");
		expect(result.outputText).toBe("done");
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledWith(
			{ commands: ["ls -la"] },
			expect.anything(),
		);
	});

	it("stops the run after repeated consecutive protocol-markup turns", async () => {
		const { tool, execute } = createRecordingTool();
		const leakedTextStep = (): AgentModelEvent[] => [
			{ type: "text-delta", text: DSML_TEXT },
			{ type: "finish", reason: "stop" },
		];
		const model = new ScriptedModel([
			leakedTextStep,
			leakedTextStep,
			leakedTextStep,
			leakedTextStep,
		]);
		const runtime = new AgentRuntime({ model, tools: [tool] });

		const result = await runtime.run("Start");

		expect(result.status).toBe("failed");
		expect(result.error?.message).toContain("tool-call markup");
		expect(execute).not.toHaveBeenCalled();
		expect(model.requests).toHaveLength(3);
	});

	it("resets the protocol-markup budget after a valid tool turn", async () => {
		const { tool, execute } = createRecordingTool();
		const leakedTextStep = (): AgentModelEvent[] => [
			{ type: "text-delta", text: DSML_TEXT },
			{ type: "finish", reason: "stop" },
		];
		const validStep = (): AgentModelEvent[] => [
			{
				type: "tool-call-delta",
				toolCallId: `call_${Math.random()}`,
				toolName: "run_commands",
				input: { commands: ["ls"] },
			},
			{ type: "finish", reason: "tool-calls" },
		];
		const model = new ScriptedModel([
			leakedTextStep,
			leakedTextStep,
			validStep,
			leakedTextStep,
			leakedTextStep,
			validStep,
			doneStep,
		]);
		const runtime = new AgentRuntime({ model, tools: [tool] });

		const result = await runtime.run("Start");

		expect(result.status).toBe("completed");
		expect(execute).toHaveBeenCalledTimes(2);
	});
});
