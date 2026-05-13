import type { EvalResult } from "./types.js";

export function generatePromptEvaluationReport(
  evaluation_results: EvalResult[],
): string {
  const total_tests = evaluation_results.length;
  const scores = evaluation_results.map((r) => r.score);
  const avg_score = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  const max_possible_score = 10;
  const pass_rate = total_tests
    ? (100 * scores.filter((s) => s >= 7).length) / total_tests
    : 0;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prompt Evaluation Report</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
    .header { background-color: #f0f0f0; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .summary-stats { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
    .stat-box { background-color: #fff; border-radius: 5px; padding: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); flex-basis: 30%; min-width: 200px; }
    .stat-value { font-size: 24px; font-weight: bold; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background-color: #4a4a4a; color: white; text-align: left; padding: 12px; }
    td { padding: 10px; border-bottom: 1px solid #ddd; vertical-align: top; width: 20%; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .score { font-weight: bold; padding: 5px 10px; border-radius: 3px; display: inline-block; }
    .score-high { background-color: #c8e6c9; color: #2e7d32; }
    .score-medium { background-color: #fff9c4; color: #f57f17; }
    .score-low { background-color: #ffcdd2; color: #c62828; }
    .score-col { width: 80px; }
    .output pre { background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 0; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 14px; line-height: 1.4; color: #333; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Prompt Evaluation Report</h1>
    <div class="summary-stats">
      <div class="stat-box">
        <div>Total Test Cases</div>
        <div class="stat-value">${total_tests}</div>
      </div>
      <div class="stat-box">
        <div>Average Score</div>
        <div class="stat-value">${avg_score.toFixed(1)} / ${max_possible_score}</div>
      </div>
      <div class="stat-box">
        <div>Pass Rate (≥7)</div>
        <div class="stat-value">${pass_rate.toFixed(1)}%</div>
      </div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Scenario</th>
        <th>Prompt Inputs</th>
        <th>Solution Criteria</th>
        <th>Output</th>
        <th>Score</th>
        <th>Reasoning</th>
      </tr>
    </thead>
    <tbody>`;

  for (const result of evaluation_results) {
    const prompt_inputs_html = Object.entries(result.test_case.prompt_inputs)
      .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
      .join("<br>");

    const criteria_string = result.test_case.solution_criteria.join("<br>• ");

    const score = result.score;
    const score_class =
      score >= 8 ? "score-high" : score <= 5 ? "score-low" : "score-medium";

    html += `
      <tr>
        <td>${result.test_case.scenario}</td>
        <td class="prompt-inputs">${prompt_inputs_html}</td>
        <td class="criteria">• ${criteria_string}</td>
        <td class="output"><pre>${result.output}</pre></td>
        <td class="score-col"><span class="score ${score_class}">${score}</span></td>
        <td class="reasoning">${result.reasoning}</td>
      </tr>`;
  }

  html += `
    </tbody>
  </table>
</body>
</html>`;

  return html;
}
