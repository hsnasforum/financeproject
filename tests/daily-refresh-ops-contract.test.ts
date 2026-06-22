import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

type DailyRefreshResult = {
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

function runDailyRefresh(root: string, args: string[] = []) {
  return spawnSync(process.execPath, [
    path.join(process.cwd(), "scripts", "daily_refresh.mjs"),
    ...args,
  ], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      OPENDART_API_KEY: "",
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
  it("runs TypeScript-backed mjs refresh wrappers through the Node tsx loader", () => {
    const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as {
      scripts?: Record<string, string>;
    };

    expect(parsed.scripts?.["news:refresh"]).toBe("node --import tsx scripts/news_refresh.mjs");
    expect(parsed.scripts?.["indicators:refresh"]).toBe("node --import tsx scripts/indicators_refresh.mjs");
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

  it("runs public source refresh steps before news and indicators", () => {
    const root = createTempRoot();
    writePackage(root, {
      "warm:if-stale": okScript("warm"),
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
  }, 20_000);

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
