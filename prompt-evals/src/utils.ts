import fs from "fs/promises";

export async function saveFile(fileName: string, data: unknown): Promise<void> {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    await fs.writeFile(fileName, jsonString);
    console.log("File successfully written!");
  } catch (err) {
    console.error("Error writing file:", err);
  }
}

export async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  max_concurrent: number,
  on_progress?: (completed: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += max_concurrent) {
    const batch = tasks.slice(i, i + max_concurrent);
    const batch_results = await Promise.all(batch.map((t) => t()));
    results.push(...batch_results);
    if (on_progress)
      on_progress(Math.min(i + max_concurrent, tasks.length), tasks.length);
  }
  return results;
}
