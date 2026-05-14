import Anthropic from "@anthropic-ai/sdk";
import {
  getCurrentDateTime,
  getCurrentDateTimeSchema,
  addDurationToDatetime,
  addDurationToDatetimeSchema,
} from "./datetime.js";
import { setReminder, setReminderSchema } from "./reminder.js";
import { batchToolSchema } from "./batch.js";

export {
  getCurrentDateTime,
  getCurrentDateTimeSchema,
  addDurationToDatetime,
  addDurationToDatetimeSchema,
  setReminder,
  setReminderSchema,
  batchToolSchema,
};

export const allTools: Anthropic.Tool[] = [
  getCurrentDateTimeSchema,
  setReminderSchema,
  addDurationToDatetimeSchema,
];

export function runTool(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
): unknown {
  switch (toolName) {
    case "get_current_datetime":
      return getCurrentDateTime({
        dateFormat: toolInput?.date_format as string | undefined,
      });
    case "add_duration_to_datetime":
      return addDurationToDatetime(
        toolInput?.datetime_str as string,
        toolInput?.duration as number | undefined,
        toolInput?.unit as string | undefined,
        toolInput?.input_format as string | undefined,
      );
    case "set_reminder":
      return setReminder(
        toolInput?.content as string,
        toolInput?.timestamp as string,
      );
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export function runTools(
  message: Anthropic.Messages.Message,
): Anthropic.ToolResultBlockParam[] {
  return message.content
    .filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    )
    .map((toolRequest) => {
      try {
        const toolOutput = runTool(
          toolRequest.name,
          toolRequest.input as Record<string, unknown> | undefined,
        );
        return {
          type: "tool_result",
          tool_use_id: toolRequest.id,
          content: JSON.stringify(toolOutput),
          is_error: false,
        } satisfies Anthropic.ToolResultBlockParam;
      } catch (error) {
        return {
          type: "tool_result",
          tool_use_id: toolRequest.id,
          content: `Error: ${(error as Error).message}`,
          is_error: true,
        } satisfies Anthropic.ToolResultBlockParam;
      }
    });
}
