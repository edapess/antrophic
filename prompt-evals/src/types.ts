export type Message = { role: "user" | "assistant"; content: string };

export interface ChatOptions {
  system?: string;
  temperature?: number;
  stopSequences?: string[];
}

export interface TestCase {
  task_description: string;
  scenario: string;
  prompt_inputs: Record<string, string>;
  solution_criteria: string[];
}

export interface GradeResult {
  strengths: string[];
  weaknesses: string[];
  reasoning: string;
  score: number;
}

export interface EvalResult {
  output: string;
  test_case: TestCase;
  score: number;
  reasoning: string;
}
