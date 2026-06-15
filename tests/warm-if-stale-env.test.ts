import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-warm-if-stale-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, ".data"), { recursive: true });
  return root;
}

function writeSnapshot(root: string, fileName: string, generatedAt: string): void {
  fs.writeFileSync(
    path.join(root, ".data", fileName),
    JSON.stringify({ meta: { generatedAt }, generatedAt }),
    "utf8",
  );
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("server address unavailable"));
      else resolve(address.port);
    });
  });
}

function runNodeScript(scriptPath: string, options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`script timed out: ${stderr || stdout}`));
    }, 30_000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("warm_if_stale env loading", () => {
  it("loads .env.local from the working directory before warming exchange snapshots", async () => {
    const root = makeRoot();
    const fresh = new Date().toISOString();
    writeSnapshot(root, "finlife_deposit_snapshot.json", fresh);
    writeSnapshot(root, "finlife_saving_snapshot.json", fresh);
    writeSnapshot(root, "benefits_snapshot.json", fresh);
    writeSnapshot(root, "exchange_snapshot.json", "2020-01-01T00:00:00.000Z");

    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      expect(url.searchParams.get("authkey")).toBe("test-exim-key");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ deal_bas_dt: "20260524", cur_unit: "USD", deal_bas_r: "1300.0" }]));
    });
    const port = await listen(server);

    try {
      fs.writeFileSync(
        path.join(root, ".env.local"),
        [
          "EXIM_EXCHANGE_API_KEY=test-exim-key",
          `EXIM_EXCHANGE_API_URL=http://127.0.0.1:${port}/exchangeJSON`,
        ].join("\n"),
        "utf8",
      );

      const env = { ...process.env };
      delete env.EXIM_EXCHANGE_API_KEY;
      delete env.EXIM_EXCHANGE_API_URL;
      delete env.EXIM_EXCHANGE_KEY_PARAM;
      delete env.EXIM_EXCHANGE_DATA;

      const result = await runNodeScript(path.join(process.cwd(), "scripts", "warm_if_stale.mjs"), {
        cwd: root,
        env,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("[warm] exchange: wrote .data/exchange_snapshot.json");
      const snapshot = JSON.parse(fs.readFileSync(path.join(root, ".data", "exchange_snapshot.json"), "utf8")) as {
        generatedAt?: string;
        asOf?: string | null;
        rowCount?: number;
      };
      expect(snapshot.generatedAt).toEqual(expect.any(String));
      expect(snapshot.asOf).toBe("2026-05-24");
      expect(snapshot.rowCount).toBe(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
