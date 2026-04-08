import { readdir } from "node:fs/promises";
import path from "node:path";

export async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(fullPath);
      }
      return [fullPath];
    })
  );

  return files.flat();
}

export function isRuntimeScript(file: string): boolean {
  return (file.endsWith(".ts") || file.endsWith(".js")) && !file.endsWith(".d.ts") && !file.endsWith(".test.ts");
}
