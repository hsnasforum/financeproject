import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const CLI_ENV_FILES = [".env.local", "env.local", ".env"] as const;

export function loadCliEnvFiles(
  cwd = process.cwd(),
  processEnv: Record<string, string | undefined> = process.env,
): void {
  for (const name of CLI_ENV_FILES) {
    const filePath = path.join(cwd, name);
    if (!fs.existsSync(filePath)) continue;
    dotenv.config({
      path: filePath,
      override: false,
      quiet: true,
      processEnv,
    });
  }
}
