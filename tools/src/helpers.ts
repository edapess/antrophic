import Anthropic from "@anthropic-ai/sdk";
import { client, model } from "./client.js";

export type Message = Anthropic.MessageParam;

export function addUserMessage(
  messages: Message[],
  message: Message | string,
): void {
  messages.push({
    role: "user",
    content: typeof message === "string" ? message : message.content,
  });
}

export function addAssistantMessage(
  messages: Message[],
  message: Message | string,
): void {
  messages.push({
    role: "assistant",
    content: typeof message === "string" ? message : message.content,
  });
}

export async function chat(
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
  if (tools.length > 0) params.tools = tools;
  if (system) params.system = system;
  return client.messages.create(params);
}

export function textFromMessage(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
