import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-public-apis-sample-"));
  tempRoots.push(root);
  return root;
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

describe("public API sample smoke script", () => {
  it("uses the Dev operation name for MOLIT sales sample URLs", async () => {
    const root = makeRoot();
    let requestedPath = "";
    const server = http.createServer((request, response) => {
      requestedPath = request.url ?? "";
      response.setHeader("content-type", "application/xml");
      response.end("<response><header><resultCode>000</resultCode></header><body><items /></body></response>");
    });
    const port = await listen(server);

    try {
      fs.writeFileSync(
        path.join(root, ".env.local"),
        [
          "MOLIT_SALES_API_KEY=test-key",
          `MOLIT_SALES_API_URL=http://127.0.0.1:${port}/1613000/RTMSDataSvcAptTradeDev`,
        ].join("\n"),
        "utf8",
      );

      const env = { ...process.env };
      for (const key of [
        "KEXIM_API_KEY",
        "MOLIT_SALES_API_KEY",
        "MOLIT_SALES_API_URL",
        "MOLIT_RENT_API_KEY",
        "MOLIT_RENT_API_URL",
        "MOIS_BENEFITS_API_KEY",
        "MOIS_BENEFITS_API_URL",
        "REB_SUBSCRIPTION_API_KEY",
        "REB_SUBSCRIPTION_API_URL",
        "OPENDART_API_KEY",
      ]) {
        delete env[key];
      }

      const result = await runNodeScript(path.join(process.cwd(), "scripts", "smoke", "public-apis-sample.mjs"), {
        cwd: root,
        env,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("[OK] molit-sales");
      expect(requestedPath).toContain("/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
