import fs, { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const scriptPath = path.join(root, "scripts", "prisma_cli_safe.mjs");

describe("Prisma safe CLI wrapper", () => {
  it("uses the JavaScript CLI entry instead of a Windows cmd shim", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain('"prisma", "build", "index.js"');
    expect(source).toContain('".next", "standalone", "node_modules", "prisma"');
    expect(source).toContain(
      "spawnSync(process.execPath, [prismaCliPath, ...finalArgs]",
    );
    expect(source).toContain("process.loadEnvFile(filePath)");
    expect(source).not.toContain('from "dotenv"');
    expect(source).not.toContain("prisma.cmd");
  });

  it("runs the installed Prisma CLI through the current Node runtime", () => {
    const result = spawnSync(process.execPath, [scriptPath, "--version"], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: "file:./prisma/prisma-cli-safe-test.db",
      },
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("prisma");
  });

  it("creates a missing SQLite file before db push and applies the schema", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-cli-safe-db-push-"));
    const databasePath = path.join(tempRoot, "database #1", "finance%ready.db");
    try {
      const result = spawnSync(process.execPath, [scriptPath, "db", "push"], {
        cwd: root,
        env: {
          ...process.env,
          DATABASE_URL: pathToFileURL(databasePath).href,
        },
        encoding: "utf8",
      });

      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
      expect(fs.statSync(databasePath).size).toBeGreaterThan(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("SQLite database file: ready");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
