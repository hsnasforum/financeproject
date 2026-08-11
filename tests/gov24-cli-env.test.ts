import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCliEnvFiles } from "../scripts/load_cli_env";

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Gov24 CLI env loading", () => {
  it("loads repo env files in priority order without overriding the inherited environment", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gov24-cli-env-"));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, ".env.local"), [
      "GOV24_FILE_PRIORITY=env-dot-local",
      "GOV24_DOT_LOCAL_ONLY=dot-local",
      "GOV24_INHERITED=env-dot-local",
    ].join("\n"));
    fs.writeFileSync(path.join(root, "env.local"), [
      "GOV24_FILE_PRIORITY=env-local",
      "GOV24_ENV_LOCAL_ONLY=env-local",
      "GOV24_INHERITED=env-local",
    ].join("\n"));
    fs.writeFileSync(path.join(root, ".env"), [
      "GOV24_FILE_PRIORITY=env",
      "GOV24_ENV_ONLY=env",
      "GOV24_INHERITED=env",
    ].join("\n"));
    const targetEnv: Record<string, string | undefined> = {
      GOV24_INHERITED: "shell",
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    loadCliEnvFiles(root, targetEnv);

    expect(targetEnv).toMatchObject({
      GOV24_INHERITED: "shell",
      GOV24_FILE_PRIORITY: "env-dot-local",
      GOV24_DOT_LOCAL_ONLY: "dot-local",
      GOV24_ENV_LOCAL_ONLY: "env-local",
      GOV24_ENV_ONLY: "env",
    });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
