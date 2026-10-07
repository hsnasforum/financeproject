import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

type DailyRefreshResult = {
  schemaVersion?: number;
  mode?: string;
  ok?: boolean;
  steps?: Array<{
    name?: string;
    status?: string;
    stdoutTail?: string;
    stderrTail?: string;
  }>;
};

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-daily-refresh-"));
  tempRoots.push(root);
  return root;
}

function writePackage(root: string, scripts: Record<string, string>): void {
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({
    name: "daily-refresh-fixture",
    private: true,
    scripts,
  }, null, 2)}\n`, "utf-8");
}

function okScript(label: string): string {
  return `node -e "console.log('${label}:ok')"`;
}

function failScript(label: string): string {
  return `node -e "console.error('${label}:failed'); process.exit(7)"`;
}

function writeStrictChildScript(root: string): void {
  fs.writeFileSync(path.join(root, "strict-child.mjs"), [
    "const label = process.argv[2] ?? 'unknown';",
    "if (!process.argv.includes('--strict')) {",
    "  console.error(`${label}:strict-missing`);",
    "  process.exit(9);",
    "}",
    "console.log(`${label}:strict-ok`);",
  ].join("\n") + "\n", "utf-8");
}

function writeWarmChildScript(root: string): void {
  fs.writeFileSync(path.join(root, "warm-child.mjs"), [
    "if (!process.argv.includes('--exchange-only')) {",
    "  console.error('warm:exchange-only-missing');",
    "  process.exit(9);",
    "}",
    "console.log('warm:exchange-only-ok');",
  ].join("\n") + "\n", "utf-8");
}

function runDailyRefresh(root: string, args: string[] = [], envOverrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, [
    path.join(process.cwd(), "scripts", "daily_refresh.mjs"),
    ...args,
  ], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      OPENDART_API_KEY: "",
      ...envOverrides,
    },
  });
}

function readResult(root: string): DailyRefreshResult {
  return JSON.parse(fs.readFileSync(path.join(root, "tmp", "daily_refresh_result.json"), "utf-8")) as DailyRefreshResult;
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("daily refresh ops contract", () => {
  it("serializes TypeScript-backed refresh writers and preserves the Node tsx loader", () => {
    const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as {
      scripts?: Record<string, string>;
    };

    expect(parsed.scripts?.["news:refresh"]).toBe(
      "node scripts/planning_writer_entry.mjs news:refresh -- node --import tsx scripts/news_refresh.mjs",
    );
    expect(parsed.scripts?.["indicators:refresh"]).toBe(
      "node scripts/planning_writer_entry.mjs indicators:refresh -- node --import tsx scripts/indicators_refresh.mjs",
    );
  });

  it("keeps FinLife if-stale refresh covering every tracked snapshot kind", () => {
    const syncSource = fs.readFileSync(path.join(process.cwd(), "scripts", "finlife_sync.mjs"), "utf-8");
    const ifStaleSource = fs.readFileSync(path.join(process.cwd(), "scripts", "finlife_sync_if_stale.mjs"), "utf-8");

    for (const kind of ["deposit", "saving", "pension", "mortgage-loan", "rent-house-loan", "credit-loan"]) {
      expect(syncSource).toContain(`"${kind}"`);
    }
    expect(syncSource).toContain("export const SUPPORTED_FINLIFE_KINDS");
    expect(ifStaleSource).toContain("SUPPORTED_FINLIFE_KINDS");
    expect(ifStaleSource).not.toContain("[\"deposit\", \"saving\"]");
  });

  it("keeps daily warm-up from invoking FinLife or Gov24 a second time", () => {
    const root = createTempRoot();
    writePackage(root, {
      "finlife:sync:if-stale": failScript("finlife-should-not-run"),
      "gov24:sync:if-stale": failScript("gov24-should-not-run"),
    });

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "warm_if_stale.mjs"),
      "--exchange-only",
      "--offline",
    ], {
      cwd: root,
      encoding: "utf-8",
      env: process.env,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("covered by canonical daily steps, skip");
    expect(result.stdout).not.toContain("should-not-run");
  });

  it("runs public source refresh steps before news and indicators", () => {
    const root = createTempRoot();
    writeWarmChildScript(root);
    writePackage(root, {
      "warm:if-stale": "node warm-child.mjs",
      "finlife:sync:if-stale": okScript("finlife"),
      "datago:sync": okScript("datago"),
      "gov24:sync:if-stale": okScript("gov24"),
      "news:refresh": okScript("news"),
      "indicators:refresh": okScript("indicators"),
      "dart:watch": okScript("dart"),
      cleanup: okScript("cleanup"),
    });

    const result = runDailyRefresh(root, ["--skip-doctor"]);

    expect(result.status).toBe(0);
    const payload = readResult(root);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.mode).toBe("best-effort");
    expect(payload.ok).toBe(true);
    expect(payload.steps?.map((step) => step.name)).toEqual([
      "warm:if-stale",
      "finlife:sync:if-stale",
      "datago:sync",
      "gov24:sync:if-stale",
      "news:refresh",
      "indicators:refresh",
      "dart:watch",
      "data:doctor",
      "cleanup",
    ]);
    expect(payload.steps?.find((step) => step.name === "finlife:sync:if-stale")).toMatchObject({
      status: "ok",
      stdoutTail: expect.stringContaining("finlife:ok"),
    });
    expect(payload.steps?.find((step) => step.name === "warm:if-stale")).toMatchObject({
      status: "ok",
      stdoutTail: expect.stringContaining("warm:exchange-only-ok"),
    });
    expect(payload.steps?.find((step) => step.name === "datago:sync")).toMatchObject({
      status: "ok",
      stdoutTail: expect.stringContaining("datago:ok"),
    });
    expect(payload.steps?.find((step) => step.name === "gov24:sync:if-stale")).toMatchObject({
      status: "ok",
      stdoutTail: expect.stringContaining("gov24:ok"),
    });
    expect(payload.steps?.find((step) => step.name === "indicators:refresh")).toMatchObject({
      status: "ok",
      stdoutTail: expect.stringContaining("indicators:ok"),
    });
    expect(payload.steps?.find((step) => step.name === "data:doctor")).toMatchObject({
      status: "skipped",
      stderrTail: "",
    });
  }, 45_000);

  it("keeps local best-effort exit zero while exposing required failure in summary.ok", () => {
    const root = createTempRoot();
    writePackage(root, {
      "warm:if-stale": okScript("warm"),
      "finlife:sync:if-stale": failScript("finlife"),
      "datago:sync": okScript("datago"),
      "gov24:sync:if-stale": okScript("gov24"),
      "news:refresh": okScript("news"),
      "indicators:refresh": okScript("indicators"),
      "dart:watch": okScript("dart"),
      cleanup: okScript("cleanup"),
    });

    const result = runDailyRefresh(root, ["--skip-doctor"]);

    expect(result.status).toBe(0);
    expect(readResult(root)).toMatchObject({
      schemaVersion: 1,
      mode: "best-effort",
      ok: false,
      steps: expect.arrayContaining([
        expect.objectContaining({ name: "finlife:sync:if-stale", status: "failed" }),
      ]),
    });
  }, 20_000);

  it("tolerates cleanup failure only in local best-effort mode", () => {
    const bestEffortRoot = createTempRoot();
    const strictRoot = createTempRoot();
    const scripts = {
      "warm:if-stale": okScript("warm"),
      "finlife:sync:if-stale": okScript("finlife"),
      "datago:sync": okScript("datago"),
      "gov24:sync:if-stale": okScript("gov24"),
      "news:refresh": okScript("news"),
      "indicators:refresh": okScript("indicators"),
      "dart:watch": okScript("dart"),
      cleanup: failScript("cleanup"),
    };
    writePackage(bestEffortRoot, scripts);
    writePackage(strictRoot, scripts);

    const bestEffort = runDailyRefresh(bestEffortRoot, ["--skip-doctor"]);
    const strict = runDailyRefresh(strictRoot, ["--strict", "--skip-doctor"]);

    expect(bestEffort.status).toBe(0);
    expect(readResult(bestEffortRoot)).toMatchObject({ mode: "best-effort", ok: true });
    expect(strict.status).toBe(1);
    expect(readResult(strictRoot)).toMatchObject({ mode: "strict", ok: false });
  }, 60_000);

  it("forwards strict mode to news, indicators, dart, and freshness doctor children", () => {
    const root = createTempRoot();
    writeStrictChildScript(root);
    writePackage(root, {
      "warm:if-stale": okScript("warm"),
      "finlife:sync:if-stale": okScript("finlife"),
      "datago:sync": okScript("datago"),
      "gov24:sync:if-stale": okScript("gov24"),
      "news:refresh": "node strict-child.mjs news",
      "indicators:refresh": "node strict-child.mjs indicators",
      "dart:watch": "node strict-child.mjs dart",
      "data:doctor": "node strict-child.mjs doctor",
      cleanup: okScript("cleanup"),
    });

    const result = runDailyRefresh(root, ["--strict"], { OPENDART_API_KEY: "fixture-key" });

    expect(result.status, result.stderr).toBe(0);
    const payload = readResult(root);
    expect(payload).toMatchObject({ mode: "strict", ok: true });
    for (const name of ["news:refresh", "indicators:refresh", "dart:watch", "data:doctor"]) {
      expect(payload.steps?.find((step) => step.name === name)?.stdoutTail).toContain("strict-ok");
    }
  }, 30_000);

  it("marks missing public source refresh scripts as required failures in strict mode", () => {
    const root = createTempRoot();
    writePackage(root, {
      "warm:if-stale": okScript("warm"),
      "news:refresh": okScript("news"),
      "indicators:refresh": okScript("indicators"),
      "dart:watch": okScript("dart"),
      cleanup: okScript("cleanup"),
    });

    const result = runDailyRefresh(root, ["--strict", "--skip-doctor"]);

    expect(result.status).toBe(1);
    const payload = readResult(root);
    expect(payload.mode).toBe("strict");
    expect(payload.ok).toBe(false);
    expect(payload.steps?.find((step) => step.name === "finlife:sync:if-stale")).toMatchObject({
      status: "failed",
      stderrTail: "script_not_found",
    });
    expect(payload.steps?.find((step) => step.name === "datago:sync")).toMatchObject({
      status: "failed",
      stderrTail: "script_not_found",
    });
    expect(payload.steps?.find((step) => step.name === "gov24:sync:if-stale")).toMatchObject({
      status: "failed",
      stderrTail: "script_not_found",
    });
  }, 20_000);
});
