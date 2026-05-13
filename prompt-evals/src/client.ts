import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import type { Message, ChatOptions } from "./types.js";

export const client = new Anthropic();
export const model = "claude-haiku-4-5";

export function addUserMessage(messages: Message[], text: string): void {
  messages.push({ role: "user", content: text });
}

export function addAssistantMessage(messages: Message[], text: string): void {
  messages.push({ role: "assistant", content: text });
}

export async function chat(
  messages: Message[],
  { system, temperature = 1.0, stopSequences = [] }: ChatOptions = {},
): Promise<string> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 1000,
    messages,
    temperature,
    stop_sequences: stopSequences,
  };

  if (system) params.system = system;

  const message = await client.messages.create(params);
  return (message.content[0] as Anthropic.TextBlock).text;
}
