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

function runNodeScript(scriptPath: string, options: { cwd: string; env: NodeJS.ProcessEnv; args?: string[] }): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...(options.args ?? [])], {
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
      response.end(JSON.stringify([{ result: 1, deal_bas_dt: "20260524", cur_unit: "USD", deal_bas_r: "1300.0" }]));
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
        args: ["--exchange-date=20260524"],
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

describe("warm_if_stale exchange receipt validation", () => {
  const previousReceipt = `{
  "generatedAt": "2020-01-01T00:00:00.000Z",
  "asOf": "2019-12-31",
  "rowCount": 7
}
`;
  const apiKey = "synthetic-exim-secret-for-receipt-test";
  const validQuote = { result: 1, deal_bas_dt: "20261009", cur_unit: "USD", deal_bas_r: "1,430.50" };

  it.each([
    { name: "empty quotes", payload: [] },
    { name: "provider error object", payload: { result: 3, message: "authentication failed" } },
    { name: "provider result failure in a quote array", payload: [{ ...validQuote, result: 4 }] },
    { name: "missing quote fields", payload: [{ deal_bas_dt: "20261009" }] },
    { name: "invalid quote rate", payload: [{ ...validQuote, deal_bas_r: "not-a-rate" }] },
    { name: "zero quote rate", payload: [{ ...validQuote, deal_bas_r: "0" }] },
    { name: "invalid calendar date", payload: [{ ...validQuote, deal_bas_dt: "20260230" }] },
    { name: "missing provider success status", payload: [{ cur_unit: "USD", deal_bas_r: "1430.50" }] },
    { name: "mixed valid and provider failure rows", payload: [validQuote, { ...validQuote, cur_unit: "EUR", result: 3 }] },
  ])("fails closed and preserves receipt bytes for $name", async ({ payload }) => {
    const root = makeRoot();
    const receiptPath = path.join(root, ".data", "exchange_snapshot.json");
    fs.writeFileSync(receiptPath, previousReceipt, "utf8");
    const before = fs.readFileSync(receiptPath);
    const server = http.createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(payload));
    });
    const port = await listen(server);

    try {
      const result = await runNodeScript(path.join(process.cwd(), "scripts", "warm_if_stale.mjs"), {
        cwd: root,
        env: {
          ...process.env,
          EXIM_EXCHANGE_API_KEY: apiKey,
          EXIM_EXCHANGE_API_URL: `http://127.0.0.1:${port}/exchangeJSON`,
          EXIM_EXCHANGE_KEY_PARAM: "authkey",
          EXIM_EXCHANGE_DATA: "AP01",
        },
        args: ["--exchange-only", "--exchange-date=20261009"],
      });

      expect({
        status: result.status,
        receipt: fs.readFileSync(receiptPath),
      }).toEqual({ status: 1, receipt: before });
      expect(result.stdout).toContain("[warm] exchange: failed");
      expect(result.stdout).not.toContain("[warm] exchange: wrote");
      expect(result.stdout + result.stderr).not.toContain(apiKey);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("writes a receipt only for nonempty valid quotes with an explicit source date", async () => {
    const root = makeRoot();
    const receiptPath = path.join(root, ".data", "exchange_snapshot.json");
    fs.writeFileSync(receiptPath, previousReceipt, "utf8");
    const requests: { searchdate: string | null; data: string | null }[] = [];
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push({ searchdate: url.searchParams.get("searchdate"), data: url.searchParams.get("data") });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([
        validQuote,
        { result: 1, deal_bas_dt: "2026-10-09", cur_unit: "JPY(100)", deal_bas_r: "962.30" },
      ]));
    });
    const port = await listen(server);

    try {
      const result = await runNodeScript(path.join(process.cwd(), "scripts", "warm_if_stale.mjs"), {
        cwd: root,
        env: {
          ...process.env,
          EXIM_EXCHANGE_API_KEY: apiKey,
          EXIM_EXCHANGE_API_URL: `http://127.0.0.1:${port}/exchangeJSON`,
          EXIM_EXCHANGE_KEY_PARAM: "authkey",
          EXIM_EXCHANGE_DATA: "AP01",
        },
        args: ["--exchange-only", "--exchange-date=20261009"],
      });

      expect(result.status).toBe(0);
      expect(requests).toHaveLength(1);
      expect(requests[0].data).toBe("AP01");
      expect(requests[0].searchdate).toMatch(/^\d{8}$/);
      const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8")) as {
        generatedAt: string;
        asOf: string;
        rowCount: number;
      };
      expect(Number.isFinite(Date.parse(receipt.generatedAt))).toBe(true);
      expect(receipt.generatedAt).not.toBe("2020-01-01T00:00:00.000Z");
      expect(receipt.asOf).toBe("2026-10-09");
      expect(receipt.rowCount).toBe(2);
      expect(result.stdout).toContain("[warm] exchange: wrote .data/exchange_snapshot.json");
      expect(result.stdout + result.stderr).not.toContain(apiKey);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.each(["EXIM_EXCHANGE_API_KEY", "EXIM_EXCHANGE_API_URL"] as const)(
    "preserves the existing skip contract when %s is missing",
    async (missingEnv) => {
      const root = makeRoot();
      const receiptPath = path.join(root, ".data", "exchange_snapshot.json");
      fs.writeFileSync(receiptPath, previousReceipt, "utf8");
      const before = fs.readFileSync(receiptPath);
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        EXIM_EXCHANGE_API_KEY: apiKey,
        EXIM_EXCHANGE_API_URL: "http://127.0.0.1:1/exchangeJSON",
      };
      delete env[missingEnv];

      const result = await runNodeScript(path.join(process.cwd(), "scripts", "warm_if_stale.mjs"), {
        cwd: root,
        env,
        args: ["--exchange-only", "--exchange-date=20261009"],
      });

      expect(result.status).toBe(0);
      expect(fs.readFileSync(receiptPath)).toEqual(before);
      expect(result.stdout).toContain("[warm] exchange: skipped (EXIM env missing)");
      expect(result.stdout + result.stderr).not.toContain(apiKey);
    },
  );
});


describe("warm_if_stale official AP01 requested-date contract", () => {
  const scriptPath = path.join(process.cwd(), "scripts", "warm_if_stale.mjs");
  const previous = JSON.stringify({ generatedAt: "2020-01-01T00:00:00.000Z", asOf: "2019-12-31", rowCount: 7 });

  async function execute(payload: unknown, date: string, fresh = false, dataParam = "AP01", fault?: "write" | "rename") {
    const root = makeRoot();
    const receiptPath = path.join(root, ".data/exchange_snapshot.json");
    const before = fresh ? JSON.stringify({ generatedAt: new Date().toISOString(), asOf: "2026-10-07", rowCount: 7 }) : previous;
    fs.writeFileSync(receiptPath, before);
    const preloadPath = path.join(root, "io-fault.mjs");
    if (fault) fs.writeFileSync(preloadPath, `import fs from 'node:fs';
      const write = fs.writeFileSync;
      const rename = fs.renameSync;
      fs.writeFileSync = function(file, value, ...rest) {
        if (${JSON.stringify(fault)} === 'write' && String(file).includes('exchange_snapshot.json')) {
          write.call(this, file, '{', ...rest);
          throw Object.assign(new Error('controlled disk-full fault'), {code:'ENOSPC'});
        }
        return write.call(this, file, value, ...rest);
      };
      fs.renameSync = function(from, to) {
        if (${JSON.stringify(fault)} === 'rename' && String(to).endsWith('exchange_snapshot.json')) throw new Error('controlled rename fault');
        return rename.call(this, from, to);
      };`);
    const requests: string[] = [];
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push(url.searchParams.get("searchdate") ?? "");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(payload));
    });
    const port = await listen(server);
    try {
      const result = await runNodeScript(scriptPath, {
        cwd: root,
        env: { ...process.env, EXIM_EXCHANGE_API_KEY: "synthetic-exim-key", EXIM_EXCHANGE_API_URL: `http://127.0.0.1:${port}/exchangeJSON`, EXIM_EXCHANGE_DATA: dataParam, ...(fault ? { NODE_OPTIONS: `--import=${preloadPath}` } : {}) },
        args: ["--exchange-only", `--exchange-date=${date}`],
      });
      return { result, requests, before, after: fs.readFileSync(receiptPath, "utf8"), receiptFiles: fs.readdirSync(path.join(root, ".data")) };
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it.each([false, true])("uses an explicitly verified AP01 request date for undated quotes (fresh receipt=%s)", async (fresh) => {
    // AP01 official output has no date column; searchdate is the source date contract.
    const observed = await execute([
      { result: 1, cur_unit: "USD", cur_nm: "미국 달러", deal_bas_r: "1,339.2", ttb: "1,325.8", tts: "1,352.59", bkpr: "1,339", yy_efee_r: "0", ten_dd_efee_r: "0", kftc_deal_bas_r: "1,339.2", kftc_bkpr: "1,339" },
      { result: 1, cur_unit: "JPY(100)", cur_nm: "일본 옌", deal_bas_r: "847.46", ttb: "838.98", tts: "855.93", bkpr: "847", yy_efee_r: "0", ten_dd_efee_r: "0", kftc_deal_bas_r: "847.46", kftc_bkpr: "847" },
    ], "20261008", fresh);
    expect(observed.result.status).toBe(0);
    expect(observed.requests).toEqual(["20261008"]);
    expect(JSON.parse(observed.after)).toMatchObject({ asOf: "2026-10-08", rowCount: 2 });
    expect(Date.parse(JSON.parse(observed.after).generatedAt)).toBeGreaterThan(Date.parse("2026-10-08T00:00:00Z"));
  });

  it.each([{ payload: null }, { payload: [] }])("preserves the receipt on a non-business-day empty response without trying another date: $payload", async ({ payload }) => {
    const observed = await execute(payload, "20261010");
    expect(observed.result.status).toBe(1);
    expect(observed.requests).toEqual(["20261010"]);
    expect(observed.after).toBe(observed.before);
  });

  it.each(["write", "rename"] as const)("preserves the old receipt and reports failure on a %s fault", async (fault) => {
    const observed = await execute([{ result: 1, cur_unit: "USD", deal_bas_r: "1339.2" }], "20261008", false, "AP01", fault);
    expect(observed.result.status).toBe(1);
    expect(observed.requests).toEqual(["20261008"]);
    expect(observed.after).toBe(observed.before);
    expect(observed.receiptFiles).toEqual(["exchange_snapshot.json"]);
  });

  it("rejects non-FX API selection before fetching or writing a receipt", async () => {
    const observed = await execute([{ result: 1, cur_unit: "USD", deal_bas_r: "1339.2" }], "20261008", false, "AP02");
    expect(observed.result.status).toBe(1);
    expect(observed.requests).toEqual([]);
    expect(observed.after).toBe(observed.before);
  });

  it("rejects a response date that disagrees with the requested source date", async () => {
    const observed = await execute([{ result: 1, cur_unit: "USD", deal_bas_r: "1339.2", deal_bas_dt: "20261007" }], "20261008");
    expect(observed.result.status).toBe(1);
    expect(observed.requests).toEqual(["20261008"]);
    expect(observed.after).toBe(observed.before);
  });

  it.each(["20260230", "2026-10-08", "20990101", "", "20261008junk"])("rejects an invalid or future explicit date before any request: %s", async (date) => {
    const observed = await execute([{ result: 1, cur_unit: "USD", deal_bas_r: "1339.2" }], date);
    expect(observed.result.status).toBe(1);
    expect(observed.requests).toEqual([]);
    expect(observed.after).toBe(observed.before);
  });
});
