import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProfile,
  deleteProfile,
  getDefaultProfileId,
  getProfile,
  listProfiles,
  restoreProfileFromTrash,
  updateProfile,
} from "../src/lib/planning/store/profileStore";
import {
  createRun,
  deleteRun,
  getRun,
  listRuns,
  restoreRunFromTrash,
} from "../src/lib/planning/store/runStore";
import {
  getPlanningFallbackUsageSnapshot,
  resetPlanningFallbackUsageSnapshot,
} from "../src/lib/planning/engine";
import { listPlanningTrash, purgePlanningTrashOlderThan } from "../src/lib/planning/store/trash";
import { type PlanningRunRecord } from "../src/lib/planning/store/types";
import { buildResultDtoV1 } from "../src/lib/planning/v2/resultDto";

const env = process.env as Record<string, string | undefined>;

const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalTrashDir = process.env.PLANNING_TRASH_DIR;
const originalProfileRegistryPath = process.env.PLANNING_PROFILE_REGISTRY_PATH;

function sampleProfile() {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 1_000_000,
    investmentAssets: 3_000_000,
    debts: [],
    goals: [],
  };
}

describe("planning store", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-store-"));
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_TRASH_DIR = path.join(root, "trash");
    env.PLANNING_PROFILE_REGISTRY_PATH = path.join(root, "vault", "profiles", "index.json");
  });

  afterEach(() => {
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;

    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalTrashDir === "string") env.PLANNING_TRASH_DIR = originalTrashDir;
    else delete env.PLANNING_TRASH_DIR;

    if (typeof originalProfileRegistryPath === "string") env.PLANNING_PROFILE_REGISTRY_PATH = originalProfileRegistryPath;
    else delete env.PLANNING_PROFILE_REGISTRY_PATH;

    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("supports profile CRUD and list", async () => {
    const created = await createProfile({
      name: "기본 프로필",
      profile: sampleProfile(),
    });

    expect(created.id).toBeTruthy();

    const listAfterCreate = await listProfiles();
    expect(listAfterCreate.map((item) => item.id)).toContain(created.id);

    const loaded = await getProfile(created.id);
    expect(loaded?.name).toBe("기본 프로필");

    const updated = await updateProfile(created.id, {
      name: "수정 프로필",
    });
    expect(updated?.name).toBe("수정 프로필");

    const deleted = await deleteProfile(created.id);
    expect(deleted).toBe(true);

    const trashProfiles = await listPlanningTrash("profiles", 50, root);
    expect(trashProfiles.some((item) => item.id === created.id)).toBe(true);

    const listAfterDelete = await listProfiles();
    expect(listAfterDelete.some((item) => item.id === created.id)).toBe(false);

    const restored = await restoreProfileFromTrash(created.id);
    expect(restored).toBe(true);

    const listAfterRestore = await listProfiles();
    expect(listAfterRestore.some((item) => item.id === created.id)).toBe(true);
  });

  it("supports run CRUD and profile-level retention", async () => {
    const profile = await createProfile({
      name: "런 테스트",
      profile: sampleProfile(),
    });

    for (let i = 0; i < 52; i += 1) {
      await createRun({
        profileId: profile.id,
        title: `run-${i + 1}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i, 0)).toISOString(),
        input: {
          horizonMonths: 12,
        },
        meta: {
          snapshot: { missing: true },
        },
        outputs: {
          simulate: {
            summary: { endNetWorthKrw: i },
            warnings: [],
            goalsStatus: [],
            keyTimelinePoints: [],
          },
        },
      });
    }

    const runs = await listRuns({ profileId: profile.id, limit: 100 });
    expect(runs.length).toBe(50);
    expect(runs[0]?.title).toBe("run-52");

    const target = runs[0];
    const loaded = await getRun(target.id);
    expect(loaded?.id).toBe(target.id);

    const deleted = await deleteRun(target.id);
    expect(deleted).toBe(true);

    const afterDelete = await getRun(target.id);
    expect(afterDelete).toBeNull();

    const trashRuns = await listPlanningTrash("runs", 100, root);
    expect(trashRuns.some((item) => item.id === target.id)).toBe(true);

    const restored = await restoreRunFromTrash(target.id);
    expect(restored).toBe(true);

    const afterRestore = await getRun(target.id);
    expect(afterRestore?.id).toBe(target.id);
  });

  it("isolates runs by profileId partition", async () => {
    const profileA = await createProfile({
      name: "가족 A",
      profile: sampleProfile(),
    });
    const profileB = await createProfile({
      name: "가족 B",
      profile: sampleProfile(),
    });

    await createRun({
      profileId: profileA.id,
      title: "run-a-1",
      input: { horizonMonths: 12 },
      meta: { snapshot: { missing: true } },
      outputs: {
        simulate: {
          summary: { endNetWorthKrw: 100 },
          warnings: [],
          goalsStatus: [],
          keyTimelinePoints: [],
        },
      },
    });
    await createRun({
      profileId: profileB.id,
      title: "run-b-1",
      input: { horizonMonths: 12 },
      meta: { snapshot: { missing: true } },
      outputs: {
        simulate: {
          summary: { endNetWorthKrw: 200 },
          warnings: [],
          goalsStatus: [],
          keyTimelinePoints: [],
        },
      },
    });

    const runsA = await listRuns({ profileId: profileA.id, limit: 20 });
    const runsB = await listRuns({ profileId: profileB.id, limit: 20 });

    expect(runsA.length).toBe(1);
    expect(runsB.length).toBe(1);
    expect(runsA[0]?.profileId).toBe(profileA.id);
    expect(runsB[0]?.profileId).toBe(profileB.id);
    expect(runsA.some((row) => row.profileId === profileB.id)).toBe(false);
    expect(runsB.some((row) => row.profileId === profileA.id)).toBe(false);
  });

  it("migrates legacy single-profile file into partition and sets default profile", async () => {
    const legacyProfile = {
      version: 1,
      id: "legacy-profile",
      name: "레거시 프로필",
      profile: sampleProfile(),
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    };
    const legacyProfilesDir = env.PLANNING_PROFILES_DIR as string;
    fs.mkdirSync(legacyProfilesDir, { recursive: true });
    const legacyPath = path.join(legacyProfilesDir, "legacy-profile.json");
    fs.writeFileSync(legacyPath, `${JSON.stringify(legacyProfile, null, 2)}\n`, "utf-8");

    const profiles = await listProfiles();
    const migrated = profiles.find((row) => row.id === "legacy-profile");
    expect(migrated).toBeDefined();

    const defaultProfileId = await getDefaultProfileId();
    expect(defaultProfileId).toBe("legacy-profile");

    const partitionPath = path.join(root, "vault", "profiles", "legacy-profile", "profile.json");
    expect(fs.existsSync(partitionPath)).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(false);

    const registryPath = env.PLANNING_PROFILE_REGISTRY_PATH as string;
    const registryPayload = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as {
      version?: number;
      defaultProfileId?: string;
      profiles?: Array<{ profileId?: string }>;
    };
    expect(registryPayload.version).toBe(1);
    expect(registryPayload.defaultProfileId).toBe("legacy-profile");
    expect((registryPayload.profiles ?? []).some((row) => row.profileId === "legacy-profile")).toBe(true);

    const listedAgain = await listProfiles();
    expect(listedAgain.filter((row) => row.id === "legacy-profile")).toHaveLength(1);
  });

  it("migrates legacy run meta into profile partition on read", async () => {
    const profile = await createProfile({
      name: "레거시 런 프로필",
      profile: sampleProfile(),
    });
    const createdRun = await createRun({
      profileId: profile.id,
      title: "legacy-run",
      input: { horizonMonths: 12 },
      meta: { snapshot: { missing: true } },
      outputs: {
        simulate: {
          summary: { endNetWorthKrw: 1234 },
          warnings: [],
          goalsStatus: [],
          keyTimelinePoints: [],
        },
      },
    });

    const partitionRunPath = path.join(root, "vault", "profiles", profile.id, "runs", createdRun.id, "run.json");
    const legacyRunPath = path.join(root, "runs", `${createdRun.id}.json`);
    const payload = fs.readFileSync(partitionRunPath, "utf-8");
    fs.mkdirSync(path.dirname(legacyRunPath), { recursive: true });
    fs.writeFileSync(legacyRunPath, payload, "utf-8");
    fs.rmSync(path.dirname(partitionRunPath), { recursive: true, force: true });

    const loaded = await getRun(createdRun.id);
    expect(loaded?.id).toBe(createdRun.id);
    expect(fs.existsSync(path.join(root, "vault", "profiles", profile.id, "runs", createdRun.id, "run.json"))).toBe(true);
  });

  it("lazy-migrates missing run engine envelope on read and persists schema version", async () => {
    resetPlanningFallbackUsageSnapshot();
    const profile = await createProfile({
      name: "엔진 마이그레이션 프로필",
      profile: sampleProfile(),
    });

    const resultDto = buildResultDtoV1({
      generatedAt: "2026-03-05T00:00:00.000Z",
      simulate: {
        summary: {
          startNetWorthKrw: 10_000_000,
          endNetWorthKrw: 12_000_000,
          worstCashKrw: 2_000_000,
          worstCashMonthIndex: 3,
          goalsAchievedCount: 1,
          goalsMissedCount: 0,
          warningsCount: 0,
        },
        warnings: [],
        goalsStatus: [],
        keyTimelinePoints: [
          {
            monthIndex: 0,
            row: {
              month: 1,
              income: 4_000_000,
              expenses: 2_200_000,
              debtPayment: 300_000,
              liquidAssets: 4_000_000,
              netWorth: 10_000_000,
              totalDebt: 1_000_000,
            },
          },
        ],
        timeline: [
          {
            month: 1,
            income: 4_000_000,
            expenses: 2_200_000,
            debtPayment: 300_000,
            liquidAssets: 4_000_000,
            netWorth: 10_000_000,
            totalDebt: 1_000_000,
          },
        ],
      },
    });

    const created = await createRun({
      profileId: profile.id,
      title: "legacy-no-engine",
      input: { horizonMonths: 12 },
      meta: { snapshot: { missing: true } },
      outputs: {
        resultDto,
      },
    });

    expect(created.outputs.engine).toBeUndefined();
    expect(created.outputs.engineSchemaVersion).toBeUndefined();

    const before = getPlanningFallbackUsageSnapshot().legacyRunEngineMigrationCount;
    const firstRead = await getRun(created.id);
    const afterFirst = getPlanningFallbackUsageSnapshot().legacyRunEngineMigrationCount;

    expect(firstRead?.outputs.engine).toBeDefined();
    expect(firstRead?.outputs.engineSchemaVersion).toBe(1);
    expect(afterFirst).toBeGreaterThanOrEqual(before);

    const secondRead = await getRun(created.id);
    const afterSecond = getPlanningFallbackUsageSnapshot().legacyRunEngineMigrationCount;
    expect(secondRead?.outputs.engine).toBeDefined();
    expect(secondRead?.outputs.engineSchemaVersion).toBe(1);
    expect(afterSecond).toBe(afterFirst);
  });

  it("stores only resultDto by default and keeps compact raw outputs only when enabled", async () => {
    const profile = await createProfile({
      name: "런 축약 테스트",
      profile: sampleProfile(),
    });

    const resultDto = {
      version: 1,
      meta: { generatedAt: "2026-03-01T00:00:00.000Z", snapshot: {} },
      summary: { totalWarnings: 0 },
      warnings: { aggregated: [], top: [] },
      goals: [],
      timeline: { points: [] },
      raw: {},
    };

    const createdDefault = await createRun({
      profileId: profile.id,
      title: "compact-default",
      input: { horizonMonths: 24 },
      meta: { snapshot: { missing: true } },
      outputs: {
        resultDto: resultDto as unknown as PlanningRunRecord["outputs"]["resultDto"],
        simulate: {
          summary: { endNetWorthKrw: 1_000_000 },
          warnings: Array.from({ length: 100 }).map((_, idx) => `WARN_${idx + 1}`),
          goalsStatus: [],
          keyTimelinePoints: [],
        },
      },
    });
    const loadedDefault = await getRun(createdDefault.id);
    expect(loadedDefault?.outputs.resultDto).toBeDefined();
    expect(loadedDefault?.outputs.simulate?.ref?.name).toBe("simulate");
    expect((loadedDefault?.outputs.simulate as { summary?: unknown } | undefined)?.summary).toBeUndefined();
    expect((loadedDefault?.outputs.simulate as { warnings?: unknown[] } | undefined)?.warnings).toBeUndefined();

    const createdRaw = await createRun({
      profileId: profile.id,
      title: "compact-raw",
      input: { horizonMonths: 24 },
      meta: { snapshot: { missing: true } },
      outputs: {
        resultDto: resultDto as unknown as PlanningRunRecord["outputs"]["resultDto"],
        simulate: {
          summary: { endNetWorthKrw: 2_000_000 },
          warnings: Array.from({ length: 100 }).map((_, idx) => `WARN_${idx + 1}`),
          goalsStatus: [],
          keyTimelinePoints: [],
          traces: Array.from({ length: 100 }).map((_, idx) => ({ code: `TRACE_${idx + 1}`, message: "trace" })),
        },
      },
    }, { storeRawOutputs: true });
    const loadedRaw = await getRun(createdRaw.id);
    expect(loadedRaw?.outputs.simulate?.ref?.name).toBe("simulate");
    expect((loadedRaw?.outputs.simulate as { warnings?: unknown[] } | undefined)?.warnings).toBeUndefined();
    expect((loadedRaw?.outputs.simulate as { traces?: unknown[] } | undefined)?.traces).toBeUndefined();
  });

  it("purges old trash entries by keepDays policy", async () => {
    const profile = await createProfile({
      name: "휴지통 purge",
      profile: sampleProfile(),
    });
    await deleteProfile(profile.id);

    const trashFile = path.join(env.PLANNING_TRASH_DIR as string, "profiles", `${profile.id}.json`);
    const oldTime = new Date("2025-01-01T00:00:00.000Z");
    fs.utimesSync(trashFile, oldTime, oldTime);

    const purged = await purgePlanningTrashOlderThan({
      keepDays: 30,
      nowIso: "2026-03-01T00:00:00.000Z",
      baseDir: root,
    });
    expect(purged.deleted).toBe(1);
    expect(await listPlanningTrash("profiles", 10, root)).toHaveLength(0);
  });

  it("writes files atomically with tmp -> rename", async () => {
    const renameSpy = vi.spyOn(fsPromises, "rename");

    const profile = await createProfile({
      name: "원자저장",
      profile: sampleProfile(),
    });

    await createRun({
      profileId: profile.id,
      input: {
        horizonMonths: 12,
      },
      meta: {
        snapshot: { missing: true },
      },
      outputs: {
        simulate: {
          summary: { endNetWorthKrw: 1 },
          warnings: [],
          goalsStatus: [],
          keyTimelinePoints: [],
        },
      },
    });

    expect(renameSpy).toHaveBeenCalled();
    expect(renameSpy.mock.calls.some(([from, to]) => (
      String(from).includes(".tmp-") && String(to).endsWith(".json")
    ))).toBe(true);

    const profileDir = env.PLANNING_PROFILES_DIR as string;
    const runDir = env.PLANNING_RUNS_DIR as string;
    const profileFiles = fs.existsSync(profileDir) ? fs.readdirSync(profileDir) : [];
    const runFiles = fs.existsSync(runDir) ? fs.readdirSync(runDir) : [];

    expect(profileFiles.some((name) => name.includes(".tmp-"))).toBe(false);
    expect(runFiles.some((name) => name.includes(".tmp-"))).toBe(false);
  });

  it("maintains runs index on create/delete", async () => {
    const profile = await createProfile({
      name: "index-test",
      profile: sampleProfile(),
    });

    const created = await createRun({
      profileId: profile.id,
      input: {
        horizonMonths: 24,
      },
      meta: {
        snapshot: { id: "snap-1", asOf: "2026-03-01", missing: false },
        health: { warningsCodes: [], criticalCount: 0 },
      },
      outputs: {
        resultDto: {
          version: 1,
          meta: { generatedAt: "2026-03-01T00:00:00.000Z", snapshot: {} },
          summary: { totalWarnings: 0 },
          warnings: { aggregated: [], top: [] },
          goals: [],
          timeline: { points: [] },
          raw: {},
        } as unknown as PlanningRunRecord["outputs"]["resultDto"],
      },
    });

    const indexPath = path.join(env.PLANNING_RUNS_DIR as string, "index.json");
    const indexAfterCreate = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as {
      entries?: Array<{ id: string }>;
    };
    expect(indexAfterCreate.entries?.some((row) => row.id === created.id)).toBe(true);

    const deleted = await deleteRun(created.id);
    expect(deleted).toBe(true);

    const indexAfterDelete = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as {
      entries?: Array<{ id: string }>;
    };
    expect(indexAfterDelete.entries?.some((row) => row.id === created.id)).toBe(false);
  });
});
