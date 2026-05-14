import Anthropic from "@anthropic-ai/sdk";

export const batchToolSchema: Anthropic.Tool = {
  name: "batch_tool",
  description: "Invoke multiple other tool calls simultaneously",
  input_schema: {
    type: "object",
    properties: {
      invocations: {
        type: "array",
        description: "The tool calls to invoke",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the tool to invoke",
            },
            arguments: {
              type: "string",
              description:
                "The arguments to the tool, encoded as a JSON string",
            },
          },
          required: ["name", "arguments"],
        },
      },
    },
    required: ["invocations"],
  },
};
