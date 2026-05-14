import {
  type Message,
  addAssistantMessage,
  chat,
  textFromMessage,
} from "./helpers.js";
import { allTools, runTools } from "./tools/index.js";

export async function runConversation(messages: Message[]): Promise<Message[]> {
  while (true) {
    const response = await chat(messages, allTools);

    addAssistantMessage(messages, response);
    console.log(textFromMessage(response));

    if (response.stop_reason !== "tool_use") break;

    const toolResults = runTools(response);
    messages.push({ role: "user", content: toolResults });
  }

  return messages;
}
