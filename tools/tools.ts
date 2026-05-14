// Load env variables and create client
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import dayjs from "dayjs";

const client = new Anthropic();
const model = "claude-haiku-4-5";

// Helper functions
type Message = Anthropic.MessageParam;

function addUserMessage(messages: Message[], message: Message | string): void {
  const userMessage: Message = {
    role: "user",
    content: typeof message === "string" ? message : message.content,
  };
  messages.push(userMessage);
}

function addAssistantMessage(
  messages: Message[],
  message: Message | string,
): void {
  const assistantMessage: Message = {
    role: "assistant",
    content: typeof message === "string" ? message : message.content,
  };
  messages.push(assistantMessage);
}

async function chat(
  messages: Message[],
  tools: Anthropic.Tool[] = [],
  system?: string,
  temperature: number = 1.0,
  stopSequences: string[] = [],
): Promise<Anthropic.Messages.Message> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 1000,
    messages,
    temperature,
    stop_sequences: stopSequences,
  };
  if (tools.length > 0) {
    params.tools = tools;
  }
  if (system) {
    params.system = system;
  }

  const message = await client.messages.create(params);
  return message;
}

function textFromMessage(message: Anthropic.Messages.Message) {
  let wholeResult = "";
  for (const block of message.content) {
    if (block.type === "text") {
      wholeResult += block.text + "\n";
    }
  }
  return wholeResult;
}

// Tools and Schemas

function addDurationToDatetime(
  datetimeStr: string,
  duration: number = 0,
  unit: string = "days",
  inputFormat: string = "YYYY-MM-DD",
): string {
  // Parse: default format is ISO date
  let date = dayjs(datetimeStr, inputFormat).toDate();
  console.log("🚀 -> addDurationToDatetime date->", date);
  //if (inputFormat === "YYYY-MM-DD") {
  //  date = new Date(datetimeStr + "T00:00:00");
  //} else {
  //  date = new Date(datetimeStr);
  //}

  switch (unit) {
    case "seconds":
      date.setSeconds(date.getSeconds() + duration);
      break;
    case "minutes":
      date.setMinutes(date.getMinutes() + duration);
      break;
    case "hours":
      date.setHours(date.getHours() + duration);
      break;
    case "days":
      date.setDate(date.getDate() + duration);
      break;
    case "weeks":
      date.setDate(date.getDate() + duration * 7);
      break;
    case "months":
      date.setMonth(date.getMonth() + duration);
      break;
    case "years":
      date.setFullYear(date.getFullYear() + duration);
      break;
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }

  // Output format matching JS: "Thursday, April 03, 2025 10:30:00 AM"
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function setReminder(content: string, timestamp: string): void {
  console.log(
    `----\nSetting the following reminder for ${timestamp}:\n${content}\n----`,
  );
}

const addDurationToDatetimeSchema: Anthropic.Tool = {
  name: "add_duration_to_datetime",
  description:
    "Adds a specified duration to a datetime string and returns the resulting datetime in a detailed format. This tool converts an input datetime string to a Javascript datetime object, adds the specified duration in the requested unit, and returns a formatted string of the resulting datetime. It handles various time units including seconds, minutes, hours, days, weeks, months, and years, with special handling for month and year calculations to account for varying month lengths and leap years. The output is always returned in a detailed format that includes the day of the week, month name, day, year, and time with AM/PM indicator (e.g., 'Thursday, April 03, 2025 10:30:00 AM').",
  input_schema: {
    type: "object",
    properties: {
      datetime_str: {
        type: "string",
        description:
          "The input datetime string to which the duration will be added. This should be formatted according to the input_format parameter.",
      },
      duration: {
        type: "number",
        description:
          "The amount of time to add to the datetime. Can be positive (for future dates) or negative (for past dates). Defaults to 0.",
      },
      unit: {
        type: "string",
        description:
          "The unit of time for the duration. Must be one of: 'seconds', 'minutes', 'hours', 'days', 'weeks', 'months', or 'years'. Defaults to 'days'.",
      },
      input_format: {
        type: "string",
        description:
          "The format string for parsing the input datetime_str, using dayjs format codes. For example, 'YYYY-MM-DD' for ISO format dates like '2025-04-03'. Defaults to 'YYYY-MM-DD'.",
      },
    },
    required: ["datetime_str"],
  },
};

const setReminderSchema: Anthropic.Tool = {
  name: "set_reminder",
  description:
    "Creates a timed reminder that will notify the user at the specified time with the provided content. This tool schedules a notification to be delivered to the user at the exact timestamp provided. It should be used when a user wants to be reminded about something specific at a future point in time. The reminder system will store the content and timestamp, then trigger a notification through the user's preferred notification channels (mobile alerts, email, etc.) when the specified time arrives. Reminders are persisted even if the application is closed or the device is restarted. Users can rely on this function for important time-sensitive notifications such as meetings, tasks, medication schedules, or any other time-bound activities.",
  input_schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The message text that will be displayed in the reminder notification. This should contain the specific information the user wants to be reminded about, such as 'Take medication', 'Join video call with team', or 'Pay utility bills'.",
      },
      timestamp: {
        type: "string",
        description:
          "The exact date and time when the reminder should be triggered, formatted as an ISO 8601 timestamp (YYYY-MM-DDTHH:MM:SS) or a Unix timestamp. The system handles all timezone processing internally, ensuring reminders are triggered at the correct time regardless of where the user is located. Users can simply specify the desired time without worrying about timezone configurations.",
      },
    },
    required: ["content", "timestamp"],
  },
};

const batchToolSchema: Anthropic.Tool = {
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

//type this function as an Anthropic.ToolFunction with the appropriate input and output types

function getCurrentDateTime({
  dateFormat = "dddd, MMMM DD, YYYY hh:mm:ss A",
}: {
  dateFormat?: string;
} = {}) {
  console.log("🚀 -> dateFormat->", dateFormat);
  if (!dateFormat) {
    throw new Error("dateFormat can't be empty");
  }
  return dayjs().format(dateFormat);
}

const getCurrentDateTimeSchema: Anthropic.Tool = {
  name: "get_current_datetime",
  description:
    "Returns the current date and time formatted according to the specified format",
  input_schema: {
    type: "object",
    properties: {
      date_format: {
        type: "string",
        description:
          "A string specifying the format of the returned datetime. Uses Javascript's strftime format codes.",
        default: "dddd, MMMM DD, YYYY hh:mm:ss A",
      },
    },
    required: [],
  },
};

//const messages: Message[] = [];

//messages.push({
//  role: "user",
//  content: `What is the exact time, formatted as HH:MM:SS`,
//});

//const response = await client.messages.create({
//  model,
//  messages,
//  max_tokens: 1000,
//  tools: [getCurrentDateTimeSchema],
//});

//messages.push({
//  role: "assistant",
//  content: response.content,
//});

//const result = getCurrentDateTime(response.content?.[0].input);
//messages.push({
//  role: "user",
//  content: [
//    {
//      type: "tool_result",
//      tool_use_id: response.content?.[0].id,
//      content: result,
//      is_error: false,
//    },
//  ],
//});

//const response2 = await client.messages.create({
//  model,
//  messages,
//  max_tokens: 1000,
//  tools: [getCurrentDateTimeSchema],
//});

function runTool(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
) {
  console.log("🚀 -> toolInput->", toolInput);
  if (toolName === "get_current_datetime") {
    return getCurrentDateTime({
      dateFormat: toolInput?.date_format as string | undefined,
    });
  } else if (toolName === "add_duration_to_datetime") {
    return addDurationToDatetime(toolInput?.datetime_str as string);
  } else if (toolName === "set_reminder") {
    return setReminder(
      toolInput?.content as string,
      toolInput?.timestamp as string,
    );
  } else {
    throw new Error(`Unknown tool: ${toolName}`);
  }
}

function runTools(message: Anthropic.Messages.Message) {
  const toolRequests = message.content.filter(
    (block) => block.type === "tool_use",
  );

  let toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

  toolRequests.forEach((toolRequest) => {
    try {
      const toolOutput = runTool(
        toolRequest.name,
        toolRequest.input as Record<string, unknown> | undefined,
      );
      const toolResultBlock: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: toolRequest.id,
        content: JSON.stringify(toolOutput),
        is_error: false,
      };
      toolResultBlocks.push(toolResultBlock);
    } catch (error) {
      const toolResultBlock: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: toolRequest.id,
        content: `Error: ${(error as Error).message}`,
        is_error: true,
      };
      toolResultBlocks.push(toolResultBlock);
    }
  });
  return toolResultBlocks;
}

async function runConversation(messages: Message[]) {
  while (true) {
    const response = await chat(messages, [
      getCurrentDateTimeSchema,
      setReminderSchema,
      addDurationToDatetimeSchema,
    ]);

    addAssistantMessage(messages, response);
    console.log("textFromMessage", textFromMessage(response));

    if (response.stop_reason !== "tool_use") break;

    const toolResults = runTools(response);
    messages.push({ role: "user", content: toolResults });
  }

  return messages;
}

const messages: Message[] = [];

addUserMessage(
  messages,
  "Set a reminder for my doctors appointment. Its 177 days after Jan 1st, 2050, choose any time",
);

runConversation(messages).then((finalMessages) => {
  console.log("Conversation finished.");
  console.log("Final messages:", finalMessages);
});
