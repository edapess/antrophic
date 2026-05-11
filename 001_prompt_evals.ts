// Load env variables and create client
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import fs from "fs/promises";

const saveFile = async (fileName: string, data: any) => {
  try {
    // Convert object to JSON string with 2-space indentation
    const jsonString = JSON.stringify(data, null, 2);

    await fs.writeFile(fileName, jsonString);
    console.log("File successfully written!");
  } catch (err) {
    console.error("Error writing file:", err);
  }
};

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
  solution_criteria: string;
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
        "format: "python" or "json" or "regex",
        "solution_criteria: "Key criteria for evaluating the solution"
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
  const raw = await chat(messages, { temperature: 0.7 });

  // Extract JSON array from model response
  const match =
    raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\[[\s\S]*\])/);
  if (!match) throw new Error("Could not extract JSON from response:\n" + raw);

  return JSON.parse(match[1]) as DatasetItem[];
}

// ── Main ────────────────────────────────────────────────────────────────────

const dataset = await generateDataset();
console.log("Generated dataset:");
//console.log(JSON.stringify(dataset, null, 2));

await saveFile("dataset.json", dataset);

async function runPrompt(test_case: DatasetItem) {
  //merges the prompt and the test case input, then return the result
  const prompt = `
  Please solve the following task:
  ${test_case["task"]}

  * Respond only with Python, JSON, or a plain Regex
  * Do not include any explanations or text, only the solution in the specified format
  `;

  const messages: Message[] = [];
  addUserMessage(messages, prompt);
  addAssistantMessage(messages, "```code");
  const output = await chat(messages, { stopSequences: ["```"] });
  return output;
}

async function gradeByModel(test_case: DatasetItem, output: string) {
  const evalPrompt = `
You are an expert AWS code reviewer. Your task is to evaluate the following AI-generated solution.

Original Task:
<task>
${test_case.task}
</task>

Solution to Evaluate:
<solution>
${output}
</solution>

Criteria you should use to evaluate the solution:
<criteria>
${test_case["solution_criteria"]}
</criteria>

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
  return JSON.parse(evalText);
}

function validateJSON(text: string) {
  const jsonRegex = /^\s*\{[\s\S]*\}\s*$/;
  if (!jsonRegex.test(text)) {
    return 0;
  }
  return 10;
}
function validatePython(text: string) {
  const pythonRegex = /^\s*def\s+\w+\s*\(.*\)\s*:\s*[\s\S]*$/;
  if (!pythonRegex.test(text)) {
    return 0;
  }
  return 10;
}
function validateRegex(text: string) {
  const regexRegex = /^\s*\/.*\/[gimsuy]*\s*$/;
  if (!regexRegex.test(text)) {
    return 0;
  }
  return 10;
}

function gradeSyntax(response, test_case) {
  const format = test_case["format"];
  switch (format) {
    case "json":
      return validateJSON(response);
    case "python":
      return validatePython(response);
    case "regex":
      return validateRegex(response);
    default:
      return 0;
  }
}

async function runTestCase(test_case: DatasetItem) {
  //runs the prompt, then grades the result
  const output = await runPrompt(test_case);

  //TODO: implement grading logic, for now we just return a dummy score
  const model_grade = await gradeByModel(test_case, output);
  const model_score = model_grade["score"];
  const reasoning = model_grade["reasoning"];
  const strengths = model_grade["strengths"];
  const weaknesses = model_grade["weaknesses"];
  const syntax_score = gradeSyntax(output, test_case);
  const score = (model_score + syntax_score) / 2; //combine model score and syntax score, giving more weight to model score
  return {
    output,
    test_case,
    score,
    reasoning,
    strengths,
    weaknesses,
    syntax_score,
  };
}

async function runEval(dataset: DatasetItem[]) {
  //loads the dataset and calls runTestCase with each case
  const result = [];
  for (const test_case of dataset) {
    const test_result = await runTestCase(test_case);
    result.push(test_result);
  }
  const average_score =
    result.reduce((acc, r) => acc + r.score, 0) / result.length;
  console.log("Average score:", average_score);
  return result;
}

//open dataset.json and pass it to runEval, then save the result to eval_results.json
async function main() {
  const datasetRaw = await fs.readFile("dataset.json", "utf-8");
  const dataset = JSON.parse(datasetRaw) as DatasetItem[];
  const evalResults = await runEval(dataset);
  await saveFile("eval_results.json", evalResults);
}

main().catch((err) => console.error(err));
