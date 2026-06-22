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

function writeNdjson(filePath: string, rows: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf-8");
}

function runReadiness(args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [
    "scripts/planning_postgres_readiness.mjs",
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      ...env,
    },
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
    expect(findStep(payload, "schema-validate")).toMatchObject({
      status: "PASS",
      postgres: {
        status: "PASS",
        schemaPath: "prisma/schema.postgres.prisma",
      },
    });
    expect(findStep(payload, "schema-sql-dry-run")).toMatchObject({
      status: "PASS",
      postgres: {
        status: "PASS",
        schemaPath: "prisma/schema.postgres.prisma",
        command: "prisma migrate diff --from-empty --to-schema <schema> --script",
        analysis: {
          status: "PASS",
          createTableCount: 28,
          expectedCreateTableCount: 28,
          requiredTables: {
            User: "PASS",
            Account: "PASS",
            PlanningProfile: "PASS",
            FinancialAccount: "PASS",
            TransactionBatch: "PASS",
            Transaction: "PASS",
            OpeningBalance: "PASS",
          },
          columnTypes: {
            bigInt: "PASS",
            decimal: "PASS",
            jsonb: "PASS",
          },
          foreignKeys: "PASS",
          sqliteMarkers: "PASS",
        },
      },
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
    const dryRunApplyStep = findStep(payload, "dry-run-apply");
    expect(dryRunApplyStep).toMatchObject({
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
      applyPlan: {
        written: true,
        operationCount: 2,
      },
    });
    const applyPlanPath = path.join(outDir, "apply-plan.json");
    const applyPlan = JSON.parse(fs.readFileSync(applyPlanPath, "utf-8")) as {
      kind?: string;
      checksum?: string;
      operationCount?: number;
      operations?: Array<{ table?: string; userId?: string; rowChecksum?: string }>;
    };
    expect(applyPlan).toMatchObject({
      kind: "planning-postgres-readiness-apply-plan",
      operationCount: 2,
    });
    expect(applyPlan.checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect((dryRunApplyStep.applyPlan as { checksum?: string }).checksum).toBe(applyPlan.checksum);
    expect(applyPlan.operations).toHaveLength(2);
    expect(new Set(applyPlan.operations?.map((operation) => operation.table))).toEqual(
      new Set(["financialAccounts", "openingBalances"]),
    );
    expect(applyPlan.operations?.every((operation) => operation.userId === "alice")).toBe(true);
    expect(applyPlan.operations?.every((operation) => /^[a-f0-9]{64}$/u.test(operation.rowChecksum ?? ""))).toBe(true);
    expect(JSON.stringify(applyPlan)).not.toContain("월급 통장");
    expect(JSON.stringify(applyPlan)).not.toContain("1250000");
    expect(fs.readFileSync(accountsPath, "utf-8")).toContain("월급 통장");
    expect(fs.readFileSync(balancesPath, "utf-8")).toContain("1250000");
  });

  it("simulates raw transaction batch apply without deriving account binding", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    const outDir = path.join(dir, "export");
    const batchId = "abcdef123456";
    writeJson(path.join(dataDir, "users", "alice", "planning-v3", "batches", "index.json"), {
      version: 1,
      items: [
        {
          id: batchId,
          createdAt: "2026-04-01T00:00:00.000Z",
          source: "csv",
          rowCount: 1,
          accounts: [{ id: "acc-main", name: "주거래" }],
        },
      ],
    });
    writeNdjson(path.join(dataDir, "users", "alice", "planning-v3", "batches", `${batchId}.ndjson`), [
      {
        txnId: "feedfacecafe",
        batchId,
        date: "2026-04-02",
        amountKrw: -25000,
        description: "점심",
        category: "food",
        source: "csv",
        meta: { rowIndex: 1 },
      },
    ]);

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
        transactionBatches: 1,
        financialAccounts: 0,
        openingBalances: 0,
        transactions: 1,
      },
      idempotentUpsert: true,
      referentialIntegrity: {
        status: "PASS",
        issueCount: 0,
      },
      rollbackOnFailure: true,
      rollbackProbe: {
        status: "PASS",
        injectedAfter: 1,
        appliedBeforeFailure: 1,
        rollbackDigestUnchanged: true,
      },
    });
  });

  it("rejects transaction account bindings without a matching financial account row", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    writeNdjson(path.join(dataDir, "users", "alice", "planning-v3", "batches", "abcdef123456.ndjson"), [
      {
        txnId: "feedfacecafe",
        batchId: "abcdef123456",
        accountId: "acc-missing",
        date: "2026-04-02",
        amountKrw: -25000,
        description: "점심",
        source: "csv",
      },
    ]);

    const result = runReadiness([
      "--dry-run",
      `--data-dir=${dataDir}`,
    ]);

    expect(result.status).toBe(1);
    const payload = parseStdout(result.stdout);
    expect(findStep(payload, "dry-run-apply")).toMatchObject({
      status: "FAIL",
      targetTables: {
        transactionBatches: 1,
        financialAccounts: 0,
        transactions: 1,
      },
      referentialIntegrity: {
        status: "FAIL",
        issueCount: 1,
        transactionsMissingFinancialAccount: 1,
      },
    });
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

  it("rejects transaction rows that cannot preserve the public number contract", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    writeNdjson(path.join(dataDir, "users", "alice", "planning-v3", "batches", "abcdef123456.ndjson"), [
      {
        txnId: "feedfacecafe",
        batchId: "abcdef123456",
        date: "2026-04-02",
        amountKrw: Number.MAX_SAFE_INTEGER + 1,
        description: "unsafe",
        source: "csv",
      },
    ]);

    const result = runReadiness([
      "--dry-run",
      `--data-dir=${dataDir}`,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("transaction.amountKrw");
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
  }, 15_000);

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

  it("fails the dry-run gate when the PostgreSQL target schema is not Prisma-valid", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    const invalidSchemaPath = path.join(dir, "schema.postgres.prisma");
    fs.writeFileSync(invalidSchemaPath, [
      "generator client {",
      "  provider = \"prisma-client-js\"",
      "}",
      "",
      "datasource db {",
      "  provider = \"postgresql\"",
      "}",
      "",
      "model Broken {",
      "  id String @id",
    ].join("\n"), "utf-8");
    writeJson(path.join(dataDir, "users", "alice", "profiles", "profile-1.json"), { id: "profile-1" });

    const result = runReadiness([
      "--dry-run",
      `--data-dir=${dataDir}`,
      `--postgres-schema=${invalidSchemaPath}`,
    ]);

    expect(result.status).toBe(1);
    const payload = parseStdout(result.stdout);
    expect(payload.ok).toBe(false);
    expect(findStep(payload, "schema-validate")).toMatchObject({
      status: "FAIL",
      postgres: {
        status: "FAIL",
      },
    });
    expect(findStep(payload, "schema-sql-dry-run")).toMatchObject({
      status: "FAIL",
      postgres: {
        status: "FAIL",
      },
    });
  });

  it("keeps confirmed apply blocked and rejects non-PostgreSQL database targets", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    writeJson(path.join(dataDir, "profiles", "profile-1.json"), { id: "profile-1" });

    const result = runReadiness([
      "--apply",
      "--confirm=APPLY POSTGRES READINESS",
      `--data-dir=${dataDir}`,
    ], {
      DATABASE_URL: "file:./prisma/dev.db",
    });

    expect(result.status).toBe(1);
    const payload = parseStdout(result.stdout);
    expect(payload).toMatchObject({
      ok: false,
      mode: "apply",
      confirmedApply: {
        status: "BLOCKED",
        available: false,
        reason: "postgres_apply_not_implemented",
        preflightStatus: "FAIL",
        databaseTarget: {
          status: "FAIL",
          envName: "DATABASE_URL",
          source: "process.env",
          reason: "unsupported_database_protocol",
          protocol: "file",
        },
        databaseConnection: {
          status: "SKIPPED",
          reason: "check_not_requested",
        },
      },
    });
    expect(findStep(payload, "manifest")).toMatchObject({ status: "PASS", fileCount: 1 });
    expect(findStep(payload, "schema-validate")).toMatchObject({ status: "PASS" });
    expect(findStep(payload, "dry-run-apply")).toMatchObject({ status: "PASS" });
    expect(findStep(payload, "checksum-compare")).toMatchObject({ status: "PASS" });
    expect(result.stderr).toContain("preflight evidence was emitted without mutating source data");
    expect(fs.readFileSync(path.join(dataDir, "profiles", "profile-1.json"), "utf-8")).toContain("profile-1");
  });

  it("keeps confirmed apply blocked after accepting a PostgreSQL database target preflight", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    writeJson(path.join(dataDir, "profiles", "profile-1.json"), { id: "profile-1" });

    const result = runReadiness([
      "--apply",
      "--confirm=APPLY POSTGRES READINESS",
      `--data-dir=${dataDir}`,
    ], {
      DATABASE_URL: "postgresql://finance_user:super-secret@localhost:5432/finance_test?schema=public",
    });

    expect(result.status).toBe(1);
    const payload = parseStdout(result.stdout);
    expect(payload).toMatchObject({
      ok: false,
      mode: "apply",
      confirmedApply: {
        status: "BLOCKED",
        available: false,
        reason: "postgres_apply_not_implemented",
        preflightStatus: "PASS",
        databaseTarget: {
          status: "PASS",
          envName: "DATABASE_URL",
          source: "process.env",
          protocol: "postgresql",
          host: "localhost:5432",
          database: "finance_test",
          redactedUrl: "postgresql://<redacted>@localhost:5432/finance_test",
        },
        databaseConnection: {
          status: "SKIPPED",
          reason: "check_not_requested",
        },
      },
    });
    expect(result.stdout).not.toContain("super-secret");
    expect(result.stderr).toContain("preflight evidence was emitted without mutating source data");
  });

  it("runs an explicit PostgreSQL connection preflight without leaking credentials", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-postgres-readiness-"));
    temp.push({ dir });
    const dataDir = path.join(dir, "planning");
    writeJson(path.join(dataDir, "profiles", "profile-1.json"), { id: "profile-1" });

    const result = runReadiness([
      "--apply",
      "--check-db-connection",
      "--confirm=APPLY POSTGRES READINESS",
      `--data-dir=${dataDir}`,
    ], {
      DATABASE_URL: "postgresql://finance_user:super-secret@127.0.0.1:1/finance_test",
    });

    expect(result.status).toBe(1);
    const payload = parseStdout(result.stdout);
    expect(payload).toMatchObject({
      ok: false,
      mode: "apply",
      confirmedApply: {
        status: "BLOCKED",
        available: false,
        reason: "postgres_apply_not_implemented",
        preflightStatus: "FAIL",
        databaseTarget: {
          status: "PASS",
          envName: "DATABASE_URL",
          source: "process.env",
          protocol: "postgresql",
          host: "127.0.0.1:1",
          database: "finance_test",
          redactedUrl: "postgresql://<redacted>@127.0.0.1:1/finance_test",
        },
        databaseConnection: {
          status: "FAIL",
          reason: "connection_check_failed",
        },
      },
    });
    expect(result.stdout).not.toContain("super-secret");
    expect(result.stdout).not.toContain("finance_user:super-secret");
    expect(result.stderr).toContain("preflight evidence was emitted without mutating source data");
  });

  it("keeps the package script wired to the dry-run readiness gate", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8")) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["planning:postgres:readiness"]).toBe(
      "node scripts/planning_postgres_readiness.mjs --dry-run",
    );
  });
});
