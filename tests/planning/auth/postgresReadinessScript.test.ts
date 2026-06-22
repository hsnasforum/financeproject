import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

type TempState = {
  dir: string;
};

function sha256(text: string): string {
  return crypto.createHash("sha256").update(Buffer.from(text, "utf-8")).digest("hex");
}

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function runReadiness(args: string[] = []) {
  return spawnSync(process.execPath, [
    "scripts/planning_postgres_readiness.mjs",
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function findStep(payload: Record<string, unknown>, name: string): Record<string, unknown> {
  const dryRunApply = payload.dryRunApply as { steps?: Array<Record<string, unknown>> };
  const step = dryRunApply.steps?.find((row) => row.name === name);
  if (!step) throw new Error(`step not found: ${name}`);
  return step;
}

describe("planning postgres readiness script", () => {
  const temp: TempState[] = [];

  afterEach(() => {
    for (const state of temp.splice(0)) {
      fs.rmSync(state.dir, { recursive: true, force: true });
    }
  });

  it("exports a dry-run manifest and verifies checksums without mutating source data", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    const outDir = path.join(dir, "export");
    const profilePayload = { id: "profile-1", name: "테스트 프로필", amountKrw: 1234567 };
    const runPayload = { id: "run-1", profileId: "profile-1", resultDto: { ok: true } };
    const profilePath = path.join(dataDir, "users", "alice", "profiles", "profile-1.json");
    const runPath = path.join(dataDir, "users", "alice", "runs", "run-1", "run.json");
    writeJson(profilePath, profilePayload);
    writeJson(runPath, runPayload);

    const result = runReadiness([
      "--dry-run",
      `--data-dir=${dataDir}`,
      `--out-dir=${outDir}`,
    ]);

    expect(result.status).toBe(0);
    const payload = parseStdout(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.mode).toBe("dry-run");
    expect(payload.export).toMatchObject({
      written: true,
    });
    expect(findStep(payload, "manifest")).toMatchObject({ status: "PASS", fileCount: 2 });
    expect(findStep(payload, "export")).toMatchObject({ status: "PASS" });
    expect(findStep(payload, "dry-run-apply")).toMatchObject({
      status: "PASS",
      sqliteModels: 14,
      postgresModels: 28,
    });
    expect(findStep(payload, "checksum-compare")).toMatchObject({ status: "PASS" });
    expect(fs.readFileSync(profilePath, "utf-8")).toContain("테스트 프로필");
    expect(fs.readFileSync(runPath, "utf-8")).toContain("run-1");

    const exportedProfilePath = path.join(outDir, "files", "users", "alice", "profiles", "profile-1.json");
    const exportedRunPath = path.join(outDir, "files", "users", "alice", "runs", "run-1", "run.json");
    expect(fs.existsSync(path.join(outDir, "manifest.json"))).toBe(true);
    expect(sha256(fs.readFileSync(exportedProfilePath, "utf-8"))).toBe(sha256(fs.readFileSync(profilePath, "utf-8")));
    expect(sha256(fs.readFileSync(exportedRunPath, "utf-8"))).toBe(sha256(fs.readFileSync(runPath, "utf-8")));
  });

  it("simulates account apply with idempotent upsert and rollback evidence", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    const outDir = path.join(dir, "export");
    const accountsPath = path.join(dataDir, "users", "alice", "planning-v3", "accounts.json");
    const balancesPath = path.join(dataDir, "users", "alice", "planning-v3", "opening-balances.json");
    writeJson(accountsPath, {
      version: 2,
      items: [
        {
          id: "acc-main",
          name: "월급 통장",
          kind: "checking",
          createdAt: "2026-01-01T00:00:00.000Z",
          startingBalanceKrw: 1200000,
        },
      ],
    });
    writeJson(balancesPath, {
      version: 1,
      items: {
        "acc-main": {
          accountId: "acc-main",
          asOfDate: "2026-03-01",
          amountKrw: 1250000,
        },
      },
    });

    const result = runReadiness([
      "--dry-run",
      `--data-dir=${dataDir}`,
      `--out-dir=${outDir}`,
    ]);

    expect(result.status).toBe(0);
    const payload = parseStdout(result.stdout);
    expect(findStep(payload, "dry-run-apply")).toMatchObject({
      status: "PASS",
      targetedFiles: 2,
      skippedRecords: 0,
      operations: 2,
      targetTables: {
        financialAccounts: 1,
        openingBalances: 1,
      },
      idempotentUpsert: true,
      rollbackOnFailure: true,
      rollbackProbe: {
        status: "PASS",
        injectedAfter: 1,
        appliedBeforeFailure: 1,
        rollbackDigestUnchanged: true,
      },
    });
    expect(fs.readFileSync(accountsPath, "utf-8")).toContain("월급 통장");
    expect(fs.readFileSync(balancesPath, "utf-8")).toContain("1250000");
  });

  it("rejects target rows that cannot preserve the public number contract", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    writeJson(path.join(dataDir, "users", "alice", "planning-v3", "accounts.json"), {
      version: 2,
      items: [
        {
          id: "acc-main",
          name: "월급 통장",
          kind: "checking",
          startingBalanceKrw: Number.MAX_SAFE_INTEGER + 1,
        },
      ],
    });

    const result = runReadiness([
      "--dry-run",
      `--data-dir=${dataDir}`,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("financialAccount.balanceKrw");
    expect(result.stderr).toContain("public number API contract");
  });

  it("replaces stale managed export files on repeated dry-runs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    const outDir = path.join(dir, "export");
    const profilePath = path.join(dataDir, "users", "alice", "profiles", "profile-1.json");
    writeJson(profilePath, { id: "profile-1", version: 1 });

    const first = runReadiness([
      "--dry-run",
      `--data-dir=${dataDir}`,
      `--out-dir=${outDir}`,
    ]);
    expect(first.status).toBe(0);

    const stalePath = path.join(outDir, "files", "users", "alice", "profiles", "stale.json");
    writeJson(stalePath, { id: "stale" });
    writeJson(profilePath, { id: "profile-1", version: 2 });

    const second = runReadiness([
      "--dry-run",
      `--data-dir=${dataDir}`,
      `--out-dir=${outDir}`,
    ]);

    expect(second.status).toBe(0);
    const payload = parseStdout(second.stdout);
    expect(findStep(payload, "checksum-compare")).toMatchObject({ status: "PASS" });
    expect(fs.existsSync(stalePath)).toBe(false);
    expect(fs.readFileSync(path.join(outDir, "files", "users", "alice", "profiles", "profile-1.json"), "utf-8"))
      .toContain('"version": 2');
    expect(fs.readdirSync(outDir).filter((name) => name.includes(".tmp-"))).toEqual([]);
  });

  it("rejects export paths inside the source data directory before writing files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    const outDir = path.join(dataDir, "export");
    writeJson(path.join(dataDir, "users", "alice", "profiles", "profile-1.json"), { id: "profile-1" });

    const result = runReadiness([
      "--dry-run",
      `--data-dir=${dataDir}`,
      `--out-dir=${outDir}`,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--out-dir must be outside --data-dir");
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it("keeps confirmed apply blocked until the PostgreSQL apply path exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    writeJson(path.join(dataDir, "profiles", "profile-1.json"), { id: "profile-1" });

    const result = runReadiness([
      "--apply",
      "--confirm=APPLY POSTGRES READINESS",
      `--data-dir=${dataDir}`,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("confirmed apply is not implemented");
    expect(fs.readFileSync(path.join(dataDir, "profiles", "profile-1.json"), "utf-8")).toContain("profile-1");
  });

  it("keeps the package script wired to the dry-run readiness gate", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8")) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["planning:postgres:readiness"]).toBe(
      "node scripts/planning_postgres_readiness.mjs --dry-run",
    );
  });
});
