import "dotenv/config";
import { addUserMessage, type Message } from "./helpers.js";
import { runConversation } from "./conversation.js";

const messages: Message[] = [];

addUserMessage(
  messages,
  "Set a reminder for my doctors appointment. Its 177 days after Jan 1st, 2050, choose any time",
);

runConversation(messages).then((finalMessages) => {
  console.log("Conversation finished.");
  console.log("Final messages:", finalMessages);
});
