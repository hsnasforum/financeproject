import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlanningOwnerDoctorValidationError,
  runPlanningOwnerDoctor,
  validatePlanningOwnerPayloadFile,
} from "../../../src/lib/ops/backup/planningOwnerDoctor";
import {
  PLANNING_DATA_OWNER_IDS,
  createPlanningArchiveContext,
  resolvePlanningDataOwners,
  type PlanningArchiveContext,
  type PlanningDataOwnerId,
  type ResolvedPlanningDataOwner,
} from "../../../src/lib/ops/backup/planningOwnerRegistry";

const CHECKED_AT = "2026-07-11T00:00:00.000Z";
const tempRoots: string[] = [];

type ValidFixture = Readonly<{
  ownerId: PlanningDataOwnerId;
  logicalPath: string;
  bytes: Buffer;
}>;

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-owner-doctor-"));
  tempRoots.push(root);
  return root;
}

function makeContext(
  root = makeTempRoot(),
  input: Readonly<{
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    userId?: string;
  }> = {},
): PlanningArchiveContext {
  return createPlanningArchiveContext({
    cwd: root,
    env: input.env ?? { NODE_ENV: "test" },
    platform: input.platform ?? "linux",
    userId: input.userId,
  });
}

function ownerById(
  owners: readonly ResolvedPlanningDataOwner[],
  ownerId: PlanningDataOwnerId,
): ResolvedPlanningDataOwner {
  const owner = owners.find((entry) => entry.ownerId === ownerId);
  if (!owner) throw new Error(`missing owner: ${ownerId}`);
  return owner;
}

function targetForLogicalPath(
  owners: readonly ResolvedPlanningDataOwner[],
  ownerId: PlanningDataOwnerId,
  logicalPath: string,
): string {
  const candidates = ownerById(owners, ownerId).locations
    .filter((location) => (
      location.kind === "file"
        ? location.logicalPath === logicalPath
        : logicalPath.startsWith(`${location.logicalPath}/`)
    ))
    .sort((left, right) => right.logicalPath.length - left.logicalPath.length);
  const location = candidates[0];
  if (!location) throw new Error(`missing location: ${ownerId}:${logicalPath}`);
  if (location.kind === "file") return location.targetPath;
  return path.join(location.targetPath, logicalPath.slice(location.logicalPath.length + 1));
}

function writeOwnerFile(
  owners: readonly ResolvedPlanningDataOwner[],
  fixture: ValidFixture,
): string {
  const targetPath = targetForLogicalPath(
    owners,
    fixture.ownerId,
    fixture.logicalPath,
  );
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, fixture.bytes);
  return targetPath;
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf-8");
}

function validFixtures(): readonly ValidFixture[] {
  const iso = CHECKED_AT;
  return [
    {
      ownerId: "stable.profile-run-vault",
      logicalPath: "profiles/profile-a.json",
      bytes: jsonBytes({
        version: 1,
        schemaVersion: 2,
        id: "profile-a",
        name: "Profile A",
        profile: {},
        createdAt: iso,
        updatedAt: iso,
      }),
    },
    {
      ownerId: "stable.reports",
      logicalPath: "reports/report-a.md",
      bytes: Buffer.from("# report\n", "utf-8"),
    },
    {
      ownerId: "v3.accounts",
      logicalPath: "accounts.json",
      bytes: jsonBytes({ version: 2, items: [] }),
    },
    {
      ownerId: "v3.opening-balances",
      logicalPath: "opening-balances.json",
      bytes: jsonBytes({ version: 1, items: {} }),
    },
    {
      ownerId: "v3.batches",
      logicalPath: "batches/index.json",
      bytes: jsonBytes({ version: 1, items: [] }),
    },
    {
      ownerId: "v3.drafts",
      logicalPath: "drafts/draft-a.json",
      bytes: jsonBytes({
        id: "draft-a",
        createdAt: iso,
        source: { kind: "csv" },
        cashflow: [],
        draftPatch: {},
        summary: {},
      }),
    },
    {
      ownerId: "v3.category-rules",
      logicalPath: "category-rules.json",
      bytes: jsonBytes({ version: 1, items: [] }),
    },
    {
      ownerId: "v3.transaction-overrides",
      logicalPath: "txn-overrides/batch-a.json",
      bytes: jsonBytes({ version: 1, items: {} }),
    },
    {
      ownerId: "v3.news",
      logicalPath: "news/items/item-a.json",
      bytes: jsonBytes({
        id: "item-a",
        sourceId: "source-a",
        title: "title",
        url: "https://example.test/item-a",
        fetchedAt: iso,
      }),
    },
    {
      ownerId: "v3.indicators",
      logicalPath: "indicators/state.json",
      bytes: jsonBytes({ schemaVersion: 1, series: {} }),
    },
    {
      ownerId: "v3.alerts",
      logicalPath: "alerts/rules.override.json",
      bytes: jsonBytes({ schemaVersion: 1, rules: [] }),
    },
    {
      ownerId: "v3.journal",
      logicalPath: "entries/entry-a.json",
      bytes: jsonBytes({
        id: "entry-a",
        date: "2026-07-11",
        observations: [],
        assumptions: [],
        chosenOptions: [],
        followUpChecklist: [],
        linkedItems: [],
        linkedIndicators: [],
        linkedScenarioIds: [],
        impactSnapshot: [],
        watchSeriesIds: [],
        createdAt: iso,
        updatedAt: iso,
      }),
    },
    {
      ownerId: "v3.exposure",
      logicalPath: "profile.json",
      bytes: jsonBytes({}),
    },
    {
      ownerId: "v3.csv-drafts",
      logicalPath: "drafts/draft-a.json",
      bytes: jsonBytes({
        id: "draft-a",
        createdAt: iso,
        source: { kind: "csv" },
        meta: { rowsParsed: 0, columnsCount: 0, warningsCount: 0 },
        monthlyCashflow: [],
        draftPatch: {
          monthlyIncomeNet: 0,
          monthlyEssentialExpenses: 0,
          monthlyDiscretionaryExpenses: 0,
        },
      }),
    },
    {
      ownerId: "v3.routines",
      logicalPath: "daily/2026-07-11.json",
      bytes: jsonBytes({
        schemaVersion: 1,
        date: "2026-07-11",
        items: [
          { id: "refresh_news", label: "뉴스 갱신", checked: false },
          { id: "check_burst_topics", label: "토픽 확인", checked: false },
          { id: "review_scenarios", label: "시나리오 확인", checked: false },
          { id: "check_watchlist_unknowns", label: "unknown 확인", checked: false },
          { id: "write_journal", label: "저널 기록", checked: false },
        ],
        savedAt: null,
      }),
    },
    {
      ownerId: "v3.scenario-overrides",
      logicalPath: "overrides.json",
      bytes: jsonBytes({ schemaVersion: 1, items: [] }),
    },
    {
      ownerId: "v3.legacy-transactions",
      logicalPath: "transactions/batches.ndjson",
      bytes: jsonBytes({
        id: "batch-a",
        createdAt: iso,
        kind: "csv",
        total: 0,
        ok: 0,
        failed: 0,
      }),
    },
  ];
}

function captureTreeDigest(root: string): string {
  const rows: string[] = [];
  function visit(current: string, relative: string): void {
    if (!fs.existsSync(current)) return;
    const stats = fs.lstatSync(current);
    if (stats.isSymbolicLink()) {
      rows.push(`L:${relative}:${fs.readlinkSync(current)}`);
      return;
    }
    if (stats.isDirectory()) {
      rows.push(`D:${relative}`);
      for (const name of fs.readdirSync(current).sort()) {
        visit(path.join(current, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    if (stats.isFile()) {
      rows.push(`F:${relative}:${createHash("sha256").update(fs.readFileSync(current)).digest("hex")}`);
      return;
    }
    rows.push(`S:${relative}:${stats.mode}`);
  }
  visit(root, "");
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

function captureValidationCode(run: () => void): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PlanningOwnerDoctorValidationError);
    return (error as PlanningOwnerDoctorValidationError).code;
  }
  throw new Error("expected PlanningOwnerDoctorValidationError");
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("planning owner doctor", () => {
  it("returns all 17 summaries in the canonical registry order for a fresh root", () => {
    const root = makeTempRoot();
    const context = makeContext(root);
    const before = captureTreeDigest(root);

    const report = runPlanningOwnerDoctor({ context, checkedAt: CHECKED_AT });

    expect(report).toMatchObject({
      ok: true,
      checkedAt: CHECKED_AT,
      counts: { checks: 17, files: 0, errors: 0, warnings: 0 },
      issues: [],
    });
    expect(report.summaries.map((summary) => summary.check)).toEqual(PLANNING_DATA_OWNER_IDS);
    expect(report.summaries.every((summary) => (
      summary.missingLocations === summary.locations
      && summary.emptyLocations === 0
      && summary.errors === 0
      && summary.warnings === 0
    ))).toBe(true);
    expect(captureTreeDigest(root)).toBe(before);
  });

  it("validates one representative payload for every owner without changing any file", () => {
    const root = makeTempRoot();
    const context = makeContext(root);
    const owners = resolvePlanningDataOwners(context);
    for (const fixture of validFixtures()) writeOwnerFile(owners, fixture);
    const unrelatedPath = path.join(root, ".data", "unowned", "keep.txt");
    fs.mkdirSync(path.dirname(unrelatedPath), { recursive: true });
    fs.writeFileSync(unrelatedPath, "keep", "utf-8");
    const before = captureTreeDigest(root);

    const report = runPlanningOwnerDoctor({ context, checkedAt: new Date(CHECKED_AT) });

    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ checks: 17, files: 17, errors: 0, warnings: 0 });
    expect(report.summaries.map((summary) => summary.check)).toEqual(PLANNING_DATA_OWNER_IDS);
    expect(report.summaries.every((summary) => summary.files === 1)).toBe(true);
    expect(fs.readFileSync(unrelatedPath, "utf-8")).toBe("keep");
    expect(captureTreeDigest(root)).toBe(before);
  });

  it("has a fail-closed corruption path for every registered owner", () => {
    const corruptions: readonly ValidFixture[] = [
      { ownerId: "stable.profile-run-vault", logicalPath: "profiles/profile-a.json", bytes: jsonBytes({}) },
      { ownerId: "stable.reports", logicalPath: "reports/report-a.md", bytes: Buffer.from([0xff]) },
      { ownerId: "v3.accounts", logicalPath: "accounts.json", bytes: jsonBytes({}) },
      { ownerId: "v3.opening-balances", logicalPath: "opening-balances.json", bytes: jsonBytes({}) },
      { ownerId: "v3.batches", logicalPath: "batches/index.json", bytes: jsonBytes({}) },
      { ownerId: "v3.drafts", logicalPath: "drafts/draft-a.json", bytes: jsonBytes([]) },
      { ownerId: "v3.category-rules", logicalPath: "category-rules.json", bytes: jsonBytes({}) },
      {
        ownerId: "v3.transaction-overrides",
        logicalPath: "txn-overrides/batch-a.json",
        bytes: jsonBytes({ version: 1, items: { aaaaaaaaaaaaaaaaaaaaaaaa: {} } }),
      },
      { ownerId: "v3.news", logicalPath: "news/items/item-a.json", bytes: jsonBytes({}) },
      { ownerId: "v3.indicators", logicalPath: "indicators/state.json", bytes: jsonBytes({ series: [] }) },
      { ownerId: "v3.alerts", logicalPath: "alerts/rules.override.json", bytes: jsonBytes({ rules: [{}] }) },
      { ownerId: "v3.journal", logicalPath: "entries/entry-a.json", bytes: jsonBytes({}) },
      { ownerId: "v3.exposure", logicalPath: "profile.json", bytes: jsonBytes({ debt: "invalid" }) },
      { ownerId: "v3.csv-drafts", logicalPath: "drafts/draft-a.json", bytes: jsonBytes({}) },
      { ownerId: "v3.routines", logicalPath: "daily/2026-07-11.json", bytes: jsonBytes({}) },
      { ownerId: "v3.scenario-overrides", logicalPath: "overrides.json", bytes: jsonBytes({ items: [{}] }) },
      { ownerId: "v3.legacy-transactions", logicalPath: "transactions/batches.ndjson", bytes: Buffer.from("{") },
    ];

    expect(corruptions.map((fixture) => fixture.ownerId)).toEqual(PLANNING_DATA_OWNER_IDS);
    for (const fixture of corruptions) {
      const code = captureValidationCode(() => validatePlanningOwnerPayloadFile(fixture));
      expect([
        "OWNER_DOCTOR_UTF8_INVALID",
        "OWNER_DOCTOR_JSON_INVALID",
        "OWNER_DOCTOR_NDJSON_INVALID",
        "OWNER_DOCTOR_SCHEMA_INVALID",
      ]).toContain(code);
    }
  });

  it("fails closed for unsupported paths and leaves caller-owned bytes untouched", () => {
    const bytes = jsonBytes({ safe: true });
    const before = Buffer.from(bytes);

    expect(captureValidationCode(() => validatePlanningOwnerPayloadFile({
      ownerId: "v3.news",
      logicalPath: "news/private-state.json",
      bytes,
    }))).toBe("OWNER_DOCTOR_SCHEMA_VALIDATOR_MISSING");
    expect(bytes).toEqual(before);
  });

  it("validates stable profile, run, registry, and run-index semantics", () => {
    const run = {
      version: 1,
      schemaVersion: 2,
      id: "run-a",
      profileId: "profile-a",
      createdAt: CHECKED_AT,
      input: {},
      meta: {},
      outputs: {},
    };
    expect(() => validatePlanningOwnerPayloadFile({
      ownerId: "stable.profile-run-vault",
      logicalPath: "runs/run-a.json",
      bytes: jsonBytes(run),
    })).not.toThrow();
    expect(() => validatePlanningOwnerPayloadFile({
      ownerId: "stable.profile-run-vault",
      logicalPath: "runs/index.json",
      bytes: jsonBytes({ version: 1, entries: [{ id: "run-a", profileId: "profile-a", createdAt: CHECKED_AT }] }),
    })).not.toThrow();
    expect(() => validatePlanningOwnerPayloadFile({
      ownerId: "stable.profile-run-vault",
      logicalPath: "vault/profiles/index.json",
      bytes: jsonBytes({
        version: 1,
        defaultProfileId: "profile-a",
        profiles: [{
          profileId: "profile-a",
          name: "Profile A",
          createdAt: CHECKED_AT,
          updatedAt: CHECKED_AT,
        }],
      }),
    })).not.toThrow();
    expect(captureValidationCode(() => validatePlanningOwnerPayloadFile({
      ownerId: "stable.profile-run-vault",
      logicalPath: "runs/run-a.json",
      bytes: jsonBytes({ id: "run-a" }),
    }))).toBe("OWNER_DOCTOR_SCHEMA_INVALID");
  });

  it("validates each transaction override row contract", () => {
    const txnId = "a".repeat(24);
    const cases = [
      {
        logicalPath: "txn-overrides/batch-a.json",
        row: { batchId: "batch-a", txnId, kind: "expense", updatedAt: CHECKED_AT },
      },
      {
        logicalPath: "txn-transfer-overrides/batch-a.json",
        row: { batchId: "batch-a", txnId, forceTransfer: true, updatedAt: CHECKED_AT },
      },
      {
        logicalPath: "txn-account-overrides/batch-a.json",
        row: { batchId: "batch-a", txnId, accountId: "account-a", updatedAt: CHECKED_AT },
      },
    ] as const;
    for (const item of cases) {
      expect(() => validatePlanningOwnerPayloadFile({
        ownerId: "v3.transaction-overrides",
        logicalPath: item.logicalPath,
        bytes: jsonBytes({ version: 1, items: { [txnId]: item.row } }),
      })).not.toThrow();
    }
    expect(captureValidationCode(() => validatePlanningOwnerPayloadFile({
      ownerId: "v3.transaction-overrides",
      logicalPath: "txn-transfer-overrides/batch-a.json",
      bytes: jsonBytes({
        version: 1,
        items: {
          [txnId]: {
            batchId: "batch-a",
            txnId,
            forceTransfer: true,
            forceNonTransfer: true,
            updatedAt: CHECKED_AT,
          },
        },
      }),
    }))).toBe("OWNER_DOCTOR_SCHEMA_INVALID");
  });

  it("rejects a namespace mismatch before touching canonical files", () => {
    const root = makeTempRoot();
    const env = { NODE_ENV: "test", PLANNING_NAMESPACE_ENABLED: "true" } satisfies NodeJS.ProcessEnv;
    const aliceContext = makeContext(root, { env, userId: "alice" });
    const bobContext = makeContext(root, { env, userId: "bob" });
    const aliceOwners = resolvePlanningDataOwners(aliceContext);
    const bobOwners = resolvePlanningDataOwners(bobContext);
    const outside = path.join(root, "outside.json");
    fs.writeFileSync(outside, "{}", "utf-8");
    const bobAccountsPath = targetForLogicalPath(bobOwners, "v3.accounts", "accounts.json");
    fs.mkdirSync(path.dirname(bobAccountsPath), { recursive: true });
    fs.symlinkSync(outside, bobAccountsPath);

    const report = runPlanningOwnerDoctor({
      context: bobContext,
      owners: aliceOwners,
      checkedAt: CHECKED_AT,
    });

    expect(report.ok).toBe(false);
    expect(report.counts.files).toBe(0);
    expect(report.issues.some((issue) => issue.code === "OWNER_DOCTOR_NAMESPACE_MISMATCH")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "OWNER_DOCTOR_LINK_NOT_ALLOWED")).toBe(false);
  });

  it("rejects schema, location, missing, and duplicate contract drift before filesystem access", () => {
    const root = makeTempRoot();
    const context = makeContext(root);
    const owners = resolvePlanningDataOwners(context);
    const accounts = ownerById(owners, "v3.accounts");
    const accountsPath = targetForLogicalPath(owners, "v3.accounts", "accounts.json");
    const outside = path.join(root, "outside.json");
    fs.writeFileSync(outside, "{}", "utf-8");
    fs.mkdirSync(path.dirname(accountsPath), { recursive: true });
    fs.symlinkSync(outside, accountsPath);
    const supplied = owners
      .filter((owner) => owner.ownerId !== "v3.opening-balances")
      .map((owner) => owner.ownerId === "v3.accounts"
        ? {
          ...owner,
          schemaVersion: owner.schemaVersion + 1,
          locations: owner.locations.map((location, index) => index === 0
            ? { ...location, targetPath: `${location.targetPath}.drift` }
            : location),
        }
        : owner);
    supplied.push(accounts);

    const report = runPlanningOwnerDoctor({ context, owners: supplied, checkedAt: CHECKED_AT });

    expect(report.ok).toBe(false);
    expect(report.counts.files).toBe(0);
    expect(report.issues.some((issue) => issue.code === "OWNER_DOCTOR_REQUIRED_OWNER_MISSING")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "OWNER_DOCTOR_CONTRACT_MISMATCH")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "OWNER_DOCTOR_LINK_NOT_ALLOWED")).toBe(false);
  });

  it("uses explicit and packaged XDG roots resolved by the owner registry", () => {
    const explicitRoot = makeTempRoot();
    const explicitDataRoot = path.join(explicitRoot, "explicit-planning");
    const explicitContext = makeContext(explicitRoot, {
      env: { NODE_ENV: "test", PLANNING_DATA_DIR: explicitDataRoot },
    });
    const explicitOwners = resolvePlanningDataOwners(explicitContext);
    writeOwnerFile(explicitOwners, validFixtures().find((row) => row.ownerId === "v3.accounts")!);

    const packagedRoot = makeTempRoot();
    const xdgRoot = path.join(packagedRoot, "xdg-data");
    const packagedContext = makeContext(packagedRoot, {
      env: {
        NODE_ENV: "production",
        XDG_DATA_HOME: xdgRoot,
        PLANNING_APP_NAME: "Finance Test",
      },
    });
    const packagedOwners = resolvePlanningDataOwners(packagedContext);
    writeOwnerFile(packagedOwners, validFixtures().find((row) => row.ownerId === "v3.accounts")!);

    expect(runPlanningOwnerDoctor({ context: explicitContext }).counts.files).toBe(1);
    expect(explicitContext.planningDataDir).toBe(explicitDataRoot);
    expect(runPlanningOwnerDoctor({ context: packagedContext }).counts.files).toBe(1);
    expect(packagedContext.planningDataDir).toBe(path.join(xdgRoot, "Finance Test", "vault"));
    expect(targetForLogicalPath(
      packagedOwners,
      "stable.profile-run-vault",
      "vault/profiles/profile-a.json",
    )).toBe(path.join(xdgRoot, "Finance Test", "vault", "vault", "profiles", "profile-a.json"));
  });

  it("rejects symbolic links without following them", () => {
    const root = makeTempRoot();
    const context = makeContext(root);
    const owners = resolvePlanningDataOwners(context);
    const linkedPath = targetForLogicalPath(owners, "v3.batches", "batches/linked.json");
    const outside = path.join(root, "outside.json");
    fs.writeFileSync(outside, JSON.stringify({ version: 1, items: [] }), "utf-8");
    fs.mkdirSync(path.dirname(linkedPath), { recursive: true });
    fs.symlinkSync(outside, linkedPath);

    const report = runPlanningOwnerDoctor({ context, checkedAt: CHECKED_AT });

    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      check: "v3.batches",
      path: "batches/linked.json",
      code: "OWNER_DOCTOR_LINK_NOT_ALLOWED",
    }));
  });

  it("rejects hard-link aliases across owner locations", () => {
    const root = makeTempRoot();
    const context = makeContext(root);
    const owners = resolvePlanningDataOwners(context);
    const accountsFixture = validFixtures().find((row) => row.ownerId === "v3.accounts")!;
    const currentPath = writeOwnerFile(owners, accountsFixture);
    const legacyPath = targetForLogicalPath(owners, "v3.accounts", "legacy/accounts.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.linkSync(currentPath, legacyPath);

    const report = runPlanningOwnerDoctor({ context, checkedAt: CHECKED_AT });

    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      check: "v3.accounts",
      path: "legacy/accounts.json",
      code: "OWNER_DOCTOR_SOURCE_ALIAS_NOT_ALLOWED",
    }));
  });

  it("rejects a single owner path hard-linked to an unowned path", () => {
    if (process.platform === "win32") return;
    const root = makeTempRoot();
    const context = makeContext(root);
    const owners = resolvePlanningDataOwners(context);
    const outside = path.join(root, "outside-accounts.json");
    fs.writeFileSync(outside, validFixtures().find((row) => row.ownerId === "v3.accounts")!.bytes);
    const accountsPath = targetForLogicalPath(owners, "v3.accounts", "accounts.json");
    fs.mkdirSync(path.dirname(accountsPath), { recursive: true });
    fs.linkSync(outside, accountsPath);

    const report = runPlanningOwnerDoctor({ context, checkedAt: CHECKED_AT });

    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      check: "v3.accounts",
      path: "accounts.json",
      code: "OWNER_DOCTOR_SOURCE_ALIAS_NOT_ALLOWED",
    }));
  });

  it("rejects special files", () => {
    if (process.platform === "win32") return;
    const root = makeTempRoot();
    const context = makeContext(root);
    const owners = resolvePlanningDataOwners(context);
    const fifoPath = targetForLogicalPath(owners, "v3.batches", "batches/special.ndjson");
    fs.mkdirSync(path.dirname(fifoPath), { recursive: true });
    execFileSync("mkfifo", [fifoPath]);

    const report = runPlanningOwnerDoctor({ context, checkedAt: CHECKED_AT });

    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      check: "v3.batches",
      path: "batches/special.ndjson",
      code: "OWNER_DOCTOR_SPECIAL_FILE_NOT_ALLOWED",
    }));
  });

  it("stops directory enumeration at the entry budget", () => {
    const root = makeTempRoot();
    const context = makeContext(root);
    const owners = resolvePlanningDataOwners(context);
    const batchesRoot = ownerById(owners, "v3.batches").locations[0]!.targetPath;
    fs.mkdirSync(batchesRoot, { recursive: true });
    const originalOpenDir = fs.opendirSync.bind(fs);
    let emitted = 0;
    let closed = false;
    const openDirSpy = vi.spyOn(fs, "opendirSync").mockImplementation(((targetPath, options) => {
      if (path.resolve(targetPath.toString()) !== path.resolve(batchesRoot)) {
        return originalOpenDir(targetPath, options);
      }
      return {
        readSync: () => {
          emitted += 1;
          return emitted <= 10_001 ? { name: `entry-${emitted}` } : null;
        },
        closeSync: () => {
          closed = true;
        },
      } as unknown as ReturnType<typeof fs.opendirSync>;
    }) as typeof fs.opendirSync);
    let report;
    try {
      report = runPlanningOwnerDoctor({ context, checkedAt: CHECKED_AT });
    } finally {
      openDirSpy.mockRestore();
    }

    expect(emitted).toBe(10_001);
    expect(closed).toBe(true);
    expect(report!.issues).toContainEqual(expect.objectContaining({
      check: "v3.batches",
      path: "batches",
      code: "OWNER_DOCTOR_LIMIT_EXCEEDED",
    }));
  });

  it("detects file growth with a bounded one-byte probe", () => {
    const root = makeTempRoot();
    const context = makeContext(root);
    const owners = resolvePlanningDataOwners(context);
    const fixture = validFixtures().find((row) => row.ownerId === "v3.accounts")!;
    const accountsPath = writeOwnerFile(owners, fixture);
    const before = fs.readFileSync(accountsPath);
    const originalRead = fs.readSync.bind(fs);
    let injected = false;
    const readSpy = vi.spyOn(fs, "readSync").mockImplementation(((
      descriptor,
      buffer,
      offset,
      length,
      position,
    ) => {
      const readBytes = originalRead(descriptor, buffer, offset, length, position);
      if (!injected && length === 1 && position === null && readBytes === 0) {
        (buffer as Uint8Array)[offset] = 0x7b;
        injected = true;
        return 1;
      }
      return readBytes;
    }) as typeof fs.readSync);
    let report;
    try {
      report = runPlanningOwnerDoctor({ context, checkedAt: CHECKED_AT });
    } finally {
      readSpy.mockRestore();
    }

    expect(injected).toBe(true);
    expect(report!.issues).toContainEqual(expect.objectContaining({
      check: "v3.accounts",
      path: "accounts.json",
      code: "OWNER_DOCTOR_SOURCE_CHANGED",
    }));
    expect(fs.readFileSync(accountsPath)).toEqual(before);
  });

  it("blocks valid encrypted envelopes as unverified and malformed markers as invalid", () => {
    const validEnvelope = jsonBytes({
      version: 2,
      alg: "aes-256-gcm",
      enc: "key",
      iv: Buffer.alloc(12, 1).toString("base64"),
      tag: Buffer.alloc(16, 2).toString("base64"),
      ciphertext: Buffer.from("ciphertext").toString("base64"),
    });
    const malformedEnvelope = jsonBytes({
      version: 2,
      alg: "aes-256-gcm",
      enc: "key",
      iv: Buffer.alloc(1).toString("base64"),
      tag: Buffer.alloc(16, 2).toString("base64"),
      ciphertext: Buffer.from("ciphertext").toString("base64"),
    });

    expect(captureValidationCode(() => validatePlanningOwnerPayloadFile({
      ownerId: "stable.profile-run-vault",
      logicalPath: "vault/profiles/profile-a.json",
      bytes: validEnvelope,
    }))).toBe("OWNER_DOCTOR_ENCRYPTED_PAYLOAD_UNVERIFIED");
    expect(captureValidationCode(() => validatePlanningOwnerPayloadFile({
      ownerId: "stable.profile-run-vault",
      logicalPath: "vault/profiles/profile-a.json",
      bytes: malformedEnvelope,
    }))).toBe("OWNER_DOCTOR_ENCRYPTED_PAYLOAD_INVALID");
  });
});
