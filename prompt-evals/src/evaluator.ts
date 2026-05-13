import fs from "fs/promises";
import type { Message, TestCase, GradeResult, EvalResult } from "./types.js";
import { addUserMessage, addAssistantMessage, chat } from "./client.js";
import { saveFile, runConcurrent } from "./utils.js";
import { generatePromptEvaluationReport } from "./report.js";

export class PromptEvaluator {
  private maxConcurrentTasks: number;

  constructor(maxConcurrentTasks = 3) {
    this.maxConcurrentTasks = maxConcurrentTasks;
  }

  render(template_string: string, variables: Record<string, string>): string {
    const placeholders = [...template_string.matchAll(/\{([^{}]+)\}/g)].map(
      (m) => m[1],
    );

    let result = template_string;
    for (const placeholder of placeholders) {
      if (placeholder in variables) {
        result = result.replaceAll(`{${placeholder}}`, variables[placeholder]);
      }
    }

    return result.replace(/\{\{/g, "{").replace(/\}\}/g, "}");
  }

  async generateUniqueIdeas(
    task_description: string,
    prompt_inputs_spec: Record<string, string>,
    num_cases: number,
  ): Promise<string[]> {
    const system_prompt =
      "You are a test scenario designer specialized in creating diverse, unique testing scenarios.";

    const example_prompt_inputs = Object.entries(prompt_inputs_spec)
      .map(([key, value]) => `"${key}": str # ${value.replace(/\n/g, "\\n")},`)
      .join("\n");

    const prompt = `
Generate {num_cases} unique, diverse ideas for testing a prompt that accomplishes this task:

<task_description>
{task_description}
</task_description>

The prompt will receive the following inputs
<prompt_inputs>
{prompt_inputs_spec}
</prompt_inputs>

Each idea should represent a distinct scenario or example that tests different aspects of the task.

Output Format:
Provide your response as a structured JSON array where each item is a brief description of the idea.

Example:
\`\`\`json
[
    "Testing with technical computer science terminology",
    "Testing with medical research findings",
    "Testing with complex mathematical concepts",
    ...
]
\`\`\`

Ensure each idea is:
- Clearly distinct from the others
- Relevant to the task description
- Specific enough to guide generation of a full test case
- Quick to solve without requiring extensive computation or multi-step processing
- Solvable with no more than 400 tokens of output

Remember, only generate {num_cases} unique ideas
`;

    const rendered_prompt = this.render(prompt, {
      task_description,
      num_cases: String(num_cases),
      prompt_inputs_spec: example_prompt_inputs,
    });

    const messages: Message[] = [];
    addUserMessage(messages, rendered_prompt);
    addAssistantMessage(messages, "```json");
    const text = await chat(messages, {
      stopSequences: ["```"],
      system: system_prompt,
      temperature: 1.0,
    });

    return JSON.parse(text) as string[];
  }

  async generateTestCase(
    task_description: string,
    idea: string,
    prompt_inputs_spec: Record<string, string> = {},
  ): Promise<TestCase> {
    const system_prompt =
      "You are a test case creator specializing in designing evaluation scenarios.";

    const example_prompt_inputs = Object.entries(prompt_inputs_spec)
      .map(
        ([key, value]) =>
          `"${key}": "EXAMPLE_VALUE", // ${value.replace(/\n/g, "\\n")}`,
      )
      .join("\n");

    const allowed_keys = Object.keys(prompt_inputs_spec)
      .map((k) => `"${k}"`)
      .join(", ");

    const prompt = `
Generate a single detailed test case for a prompt evaluation based on:

<task_description>
{task_description}
</task_description>

<specific_idea>
{idea}
</specific_idea>

<allowed_input_keys>
{allowed_keys}
</allowed_input_keys>

Output Format:
\`\`\`json
{{
    "prompt_inputs": {{
    {example_prompt_inputs}
    }},
    "solution_criteria": ["criterion 1", "criterion 2", ...] // Concise list of criteria for evaluating the solution, 1 to 4 items
}}
\`\`\`

IMPORTANT REQUIREMENTS:
- You MUST ONLY use these exact input keys in your prompt_inputs: {allowed_keys}
- Do NOT add any additional keys to prompt_inputs
- All keys listed in allowed_input_keys must be included in your response
- Make the test case realistic and practically useful
- Include measurable, concise solution criteria
- The solution criteria should ONLY address the direct requirements of the task description and the generated prompt_inputs
- Avoid over-specifying criteria with requirements that go beyond the core task
- Keep solution criteria simple, focused, and directly tied to the fundamental task
- The test case should be tailored to the specific idea provided
- Quick to solve without requiring extensive computation or multi-step processing
- Solvable with no more than 400 tokens of output
- DO NOT include any fields beyond those specified in the output format

Here's an example of a sample input with an ideal output:
<sample_input>
<sample_task_description>
Extract topics out of a passage of text
</sample_task_description>
<sample_specific_idea>
Testing with a text that contains multiple nested topics and subtopics
</sample_specific_idea>
<sample_allowed_input_keys>
"content"
</sample_allowed_input_keys>
</sample_input>
<ideal_output>
\`\`\`json
{
    "prompt_inputs": {
        "content": "The transition to renewable energy encompasses numerous interdependent dimensions. Solar photovoltaic technology has seen dramatic cost reductions, with panel efficiency improving 24% since 2010 while manufacturing costs declined by 89%, making it economically competitive with fossil fuels in many markets."
    },
    "solution_criteria": [
        "Includes all topics mentioned"
    ]
}
\`\`\`
</ideal_output>
This is ideal output because the solution criteria is concise and doesn't ask for anything outside of the scope of the task description.
`;

    const rendered_prompt = this.render(prompt, {
      allowed_keys,
      task_description,
      idea,
      example_prompt_inputs,
    });

    const messages: Message[] = [];
    addUserMessage(messages, rendered_prompt);
    addAssistantMessage(messages, "```json");
    const text = await chat(messages, {
      stopSequences: ["```"],
      system: system_prompt,
      temperature: 0.7,
    });

    const test_case = JSON.parse(text) as Pick<
      TestCase,
      "prompt_inputs" | "solution_criteria"
    >;
    return { ...test_case, task_description, scenario: idea };
  }

  async generateDataset({
    task_description,
    prompt_inputs_spec = {},
    num_cases = 3,
    output_file = "dataset.json",
  }: {
    task_description: string;
    prompt_inputs_spec: Record<string, string>;
    num_cases?: number;
    output_file: string;
  }): Promise<TestCase[]> {
    try {
      const dataset_raw = await fs.readFile(output_file, "utf-8");
      console.log(
        `Dataset file ${output_file} already exists. Skipping generation.`,
      );
      return JSON.parse(dataset_raw) as TestCase[];
    } catch {
      console.log(`Dataset file ${output_file} does not exist. Generating...`);
    }
    const ideas = await this.generateUniqueIdeas(
      task_description,
      prompt_inputs_spec,
      num_cases,
    );

    let completed = 0;
    const total = ideas.length;
    let last_reported_percentage = 0;

    const tasks = ideas.map((idea) => async () => {
      const result = await this.generateTestCase(
        task_description,
        idea,
        prompt_inputs_spec,
      );
      completed++;
      const current_percentage = Math.floor((completed / total) * 100);
      const milestone_percentage = Math.floor(current_percentage / 20) * 20;
      if (milestone_percentage > last_reported_percentage) {
        console.log(`Generated ${completed}/${total} test cases`);
        last_reported_percentage = milestone_percentage;
      }
      return result;
    });

    const dataset = await runConcurrent(tasks, this.maxConcurrentTasks);

    await saveFile(output_file, dataset);
    return dataset;
  }

  async gradeOutput(
    test_case: TestCase,
    output: string,
    extra_criteria?: string,
  ): Promise<GradeResult> {
    const prompt_inputs = Object.entries(test_case.prompt_inputs)
      .map(([key, value]) => `"${key}":"${value.replace(/\n/g, "\\n")}",`)
      .join("\n");

    const extra_criteria_section = extra_criteria
      ? `Mandatory Requirements - ANY VIOLATION MEANS AUTOMATIC FAILURE (score of 3 or lower):
<extra_important_criteria>
${extra_criteria}
</extra_important_criteria>`
      : "";

    const eval_template = `
Your task is to evaluate the following AI-generated solution with EXTREME RIGOR.

Original task description:
<task_description>
{task_description}
</task_description>

Original task inputs:
<task_inputs>
{{ {prompt_inputs} }}
</task_inputs>

Solution to Evaluate:
<solution>
{output}
</solution>

Criteria you should use to evaluate the solution:
<criteria>
{solution_criteria}
</criteria>

{extra_criteria_section}

Scoring Guidelines:
* Score 1-3: Solution fails to meet one or more MANDATORY requirements
* Score 4-6: Solution meets all mandatory requirements but has significant deficiencies in secondary criteria
* Score 7-8: Solution meets all mandatory requirements and most secondary criteria, with minor issues
* Score 9-10: Solution meets all mandatory and secondary criteria

IMPORTANT SCORING INSTRUCTIONS:
* Grade the output based ONLY on the listed criteria. Do not add your own extra requirements.
* If a solution meets all of the mandatory and secondary criteria give it a 10
* Don't complain that the solution "only" meets the mandatory and secondary criteria. Solutions shouldn't go above and beyond - they should meet the exact listed criteria.
* ANY violation of a mandatory requirement MUST result in a score of 3 or lower
* The full 1-10 scale should be utilized - don't hesitate to give low scores when warranted

Output Format
Provide your evaluation as a structured JSON object with the following fields, in this specific order:
- "strengths": An array of 1-3 key strengths
- "weaknesses": An array of 1-3 key areas for improvement
- "reasoning": A concise explanation of your overall assessment
- "score": A number between 1-10

Respond with JSON. Keep your response concise and direct.
Example response shape:
{{
    "strengths": string[],
    "weaknesses": string[],
    "reasoning": string,
    "score": number
}}
`;

    const eval_prompt = this.render(eval_template, {
      task_description: test_case.task_description,
      prompt_inputs,
      output,
      solution_criteria: test_case.solution_criteria.join("\n"),
      extra_criteria_section,
    });

    const messages: Message[] = [];
    addUserMessage(messages, eval_prompt);
    addAssistantMessage(messages, "```json");
    const eval_text = await chat(messages, {
      stopSequences: ["```"],
      temperature: 0.0,
    });

    return JSON.parse(eval_text) as GradeResult;
  }

  async runTestCase(
    test_case: TestCase,
    run_prompt_function: (
      prompt_inputs: Record<string, string>,
    ) => Promise<string>,
    extra_criteria?: string,
  ): Promise<EvalResult> {
    const output = await run_prompt_function(test_case.prompt_inputs);
    const model_grade = await this.gradeOutput(
      test_case,
      output,
      extra_criteria,
    );

    return {
      output,
      test_case,
      score: model_grade.score,
      reasoning: model_grade.reasoning,
    };
  }

  async runEvaluation(
    run_prompt_function: (
      prompt_inputs: Record<string, string>,
    ) => Promise<string>,
    dataset_file: string,
    extra_criteria?: string,
    json_output_file = "output.json",
    html_output_file = "output.html",
  ): Promise<EvalResult[]> {
    const dataset_raw = await fs.readFile(dataset_file, "utf-8");
    const dataset = JSON.parse(dataset_raw) as TestCase[];

    let completed = 0;
    const total = dataset.length;
    let last_reported_percentage = 0;

    const tasks = dataset.map((test_case) => async () => {
      const result = await this.runTestCase(
        test_case,
        run_prompt_function,
        extra_criteria,
      );
      completed++;
      const current_percentage = Math.floor((completed / total) * 100);
      const milestone_percentage = Math.floor(current_percentage / 20) * 20;
      if (milestone_percentage > last_reported_percentage) {
        console.log(`Graded ${completed}/${total} test cases`);
        last_reported_percentage = milestone_percentage;
      }
      return result;
    });

    const results = await runConcurrent(tasks, this.maxConcurrentTasks);
    const average_score =
      results.reduce((acc, r) => acc + r.score, 0) / results.length;
    console.log(`Average score: ${average_score}`);

    await saveFile(json_output_file, results);
    const html = generatePromptEvaluationReport(results);
    await fs.writeFile(html_output_file, html, "utf-8");

    return results;
  }
}
