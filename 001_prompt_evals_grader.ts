// Load env variables and create client
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import fs from "fs/promises";

const client = new Anthropic();
const model = "claude-haiku-4-5";

type Message = { role: "user" | "assistant"; content: string };

interface ChatOptions {
  system?: string;
  temperature?: number;
  stopSequences?: string[];
}

interface DatasetItem {
  task: string;
  format: "python" | "json" | "regex";
}

interface GradeResult {
  strengths: string[];
  weaknesses: string[];
  reasoning: string;
  score: number;
}

interface TestResult {
  output: string;
  test_case: DatasetItem;
  score: number;
  reasoning: string;
}

// ── Helper functions ────────────────────────────────────────────────────────

function addUserMessage(messages: Message[], text: string): void {
  messages.push({ role: "user", content: text });
}

function addAssistantMessage(messages: Message[], text: string): void {
  messages.push({ role: "assistant", content: text });
}

async function chat(
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

// ── Dataset generation ──────────────────────────────────────────────────────

async function generateDataset(): Promise<DatasetItem[]> {
  const prompt = `
Generate a evaluation dataset for a prompt evaluation. The dataset will be used to evaluate prompts
that generate Python, JSON, or Regex specifically for AWS-related tasks. Generate an array of JSON objects,
each representing task that requires Python, JSON, or a Regex to complete.

Example output:
\`\`\`json
[
    {
        "task": "Description of task",
        "format": "json" or "python" or "regex"
    },
    ...additional
]
\`\`\`

* Focus on tasks that can be solved by writing a single Python function, a single JSON object, or a regular expression.
* Focus on tasks that do not require writing much code

Please generate 3 objects.
`;

  const messages: Message[] = [];
  addUserMessage(messages, prompt);
  addAssistantMessage(messages, "```json");
  const text = await chat(messages, { stopSequences: ["```"] });
  return JSON.parse(text) as DatasetItem[];
}

// ── Grading ─────────────────────────────────────────────────────────────────

async function gradeByModel(
  testCase: DatasetItem,
  output: string,
): Promise<GradeResult> {
  const evalPrompt = `
You are an expert AWS code reviewer. Your task is to evaluate the following AI-generated solution.

Original Task:
<task>
${testCase.task}
</task>

Solution to Evaluate:
<solution>
${output}
</solution>

Output Format
Provide your evaluation as a structured JSON object with the following fields, in this specific order:
- "strengths": An array of 1-3 key strengths
- "weaknesses": An array of 1-3 key areas for improvement
- "reasoning": A concise explanation of your overall assessment
- "score": A number between 1-10

Respond with JSON. Keep your response concise and direct.
Example response shape:
{
    "strengths": string[],
    "weaknesses": string[],
    "reasoning": string,
    "score": number
}
  `;

  const messages: Message[] = [];
  addUserMessage(messages, evalPrompt);
  addAssistantMessage(messages, "```json");
  const evalText = await chat(messages, { stopSequences: ["```"] });
  return JSON.parse(evalText) as GradeResult;
}

// ── Prompt runner ────────────────────────────────────────────────────────────

async function runPrompt(testCase: DatasetItem): Promise<string> {
  const prompt = `
Please solve the following task:

${testCase.task}
`;

  const messages: Message[] = [];
  addUserMessage(messages, prompt);
  return chat(messages);
}

// ── Test case runner ─────────────────────────────────────────────────────────

async function runTestCase(testCase: DatasetItem): Promise<TestResult> {
  const output = await runPrompt(testCase);
  const modelGrade = await gradeByModel(testCase, output);

  return {
    output,
    test_case: testCase,
    score: modelGrade.score,
    reasoning: modelGrade.reasoning,
  };
}

// ── Eval runner ──────────────────────────────────────────────────────────────

async function runEval(dataset: DatasetItem[]): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const testCase of dataset) {
    const result = await runTestCase(testCase);
    results.push(result);
  }

  const averageScore =
    results.reduce((sum, r) => sum + r.score, 0) / results.length;
  console.log(`Average score: ${averageScore}`);

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const datasetRaw = await fs.readFile("dataset.json", "utf-8");
  const dataset = JSON.parse(datasetRaw) as DatasetItem[];

  const results = await runEval(dataset);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => console.error(err));
