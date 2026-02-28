import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProfile,
  deleteProfile,
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
import { listPlanningTrash, purgePlanningTrashOlderThan } from "../src/lib/planning/store/trash";

const env = process.env as Record<string, string | undefined>;

const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalTrashDir = process.env.PLANNING_TRASH_DIR;

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
  });

  afterEach(() => {
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;

    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalTrashDir === "string") env.PLANNING_TRASH_DIR = originalTrashDir;
    else delete env.PLANNING_TRASH_DIR;

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
});
