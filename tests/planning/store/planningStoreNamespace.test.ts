import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDefaultProfileId,
  getProfile,
  listProfiles,
  upsertProfileRecord,
} from "../../../src/lib/planning/store/profileStore";
import {
  createRun,
  getRun,
  listRuns,
} from "../../../src/lib/planning/store/runStore";
import { runWithPlanningUserScope } from "../../../src/lib/planning/store/userScope";
import { type PlanningRunRecord } from "../../../src/lib/planning/store/types";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_SINGLE_USER_MODE",
  "PLANNING_USER_ID",
  "PLANNING_PROFILES_DIR",
  "PLANNING_RUNS_DIR",
  "PLANNING_TRASH_DIR",
  "PLANNING_PROFILE_META_PATH",
  "PLANNING_PROFILE_REGISTRY_PATH",
  "PLANNING_PROFILE_PARTITIONS_DIR",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

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

function resultDto(): NonNullable<PlanningRunRecord["outputs"]["resultDto"]> {
  return {
    version: 1,
    meta: { generatedAt: "2026-03-01T00:00:00.000Z", snapshot: {} },
    summary: { totalWarnings: 0 },
    warnings: { aggregated: [], top: [] },
    goals: [],
    timeline: { points: [] },
    raw: {},
  } as NonNullable<PlanningRunRecord["outputs"]["resultDto"]>;
}

async function writeUserFixture(userId: string, label: string) {
  return runWithPlanningUserScope({ userId }, async () => {
    await upsertProfileRecord({
      id: "shared-profile",
      name: `${label} profile`,
      profile: sampleProfile(),
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await createRun({
      id: "shared-run",
      profileId: "shared-profile",
      title: `${label} run`,
      input: { horizonMonths: 12 },
      meta: { snapshot: { missing: true } },
      outputs: { resultDto: resultDto() },
    }, { enforceRetention: false });
  });
}

async function readUserFixture(userId: string) {
  return runWithPlanningUserScope({ userId }, async () => ({
    defaultProfileId: await getDefaultProfileId(),
    profile: await getProfile("shared-profile"),
    profiles: await listProfiles(),
    run: await getRun("shared-run"),
    runs: await listRuns({ profileId: "shared-profile", limit: 10 }),
  }));
}

describe("planning store namespace ownership", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-store-namespace-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_USER_ID = "default";
    delete env.PLANNING_PROFILES_DIR;
    delete env.PLANNING_RUNS_DIR;
    delete env.PLANNING_TRASH_DIR;
    delete env.PLANNING_PROFILE_META_PATH;
    delete env.PLANNING_PROFILE_REGISTRY_PATH;
    delete env.PLANNING_PROFILE_PARTITIONS_DIR;
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps profile metadata, registry, and runs isolated by planning user namespace", async () => {
    await writeUserFixture("alice", "Alice");
    await writeUserFixture("bob", "Bob");

    const alice = await readUserFixture("alice");
    const bob = await readUserFixture("bob");

    expect(alice.defaultProfileId).toBe("shared-profile");
    expect(bob.defaultProfileId).toBe("shared-profile");
    expect(alice.profile?.name).toBe("Alice profile");
    expect(bob.profile?.name).toBe("Bob profile");
    expect(alice.profiles.map((row) => row.name)).toEqual(["Alice profile"]);
    expect(bob.profiles.map((row) => row.name)).toEqual(["Bob profile"]);
    expect(alice.run?.title).toBe("Alice run");
    expect(bob.run?.title).toBe("Bob run");
    expect(alice.runs.map((row) => row.title)).toEqual(["Alice run"]);
    expect(bob.runs.map((row) => row.title)).toEqual(["Bob run"]);

    for (const userId of ["alice", "bob"]) {
      expect(fs.existsSync(path.join(root, "users", userId, "vault", "profiles.meta.json"))).toBe(true);
      expect(fs.existsSync(path.join(root, "users", userId, "vault", "profiles", "index.json"))).toBe(true);
      expect(fs.existsSync(path.join(root, "users", userId, "vault", "profiles", "shared-profile", "profile.json"))).toBe(true);
      expect(fs.existsSync(path.join(root, "users", userId, "vault", "profiles", "shared-profile", "runs", "shared-run", "run.json"))).toBe(true);
      expect(fs.existsSync(path.join(root, "users", userId, "runs", "index.json"))).toBe(true);
    }

    expect(fs.existsSync(path.join(root, "vault", "profiles.meta.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, "vault", "profiles", "index.json"))).toBe(false);
  });

  it("keeps namespace writes bound to the scope captured at entry", async () => {
    const scope: { userId: string; authSource: "trusted-header" } = {
      userId: "alice",
      authSource: "trusted-header",
    };

    await runWithPlanningUserScope(scope, async () => {
      scope.userId = "bob";
      await upsertProfileRecord({
        id: "mutable-profile",
        name: "Stable profile",
        profile: sampleProfile(),
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      });
    });

    const aliceProfile = await runWithPlanningUserScope({ userId: "alice" }, () => getProfile("mutable-profile"));
    const bobProfile = await runWithPlanningUserScope({ userId: "bob" }, () => getProfile("mutable-profile"));

    expect(aliceProfile?.name).toBe("Stable profile");
    expect(bobProfile).toBeNull();
    expect(fs.existsSync(path.join(root, "users", "alice", "vault", "profiles", "mutable-profile", "profile.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "users", "bob", "vault", "profiles", "mutable-profile", "profile.json"))).toBe(false);
  });

  it("stores explicit single-user mode data under users/default instead of shared roots", async () => {
    env.NODE_ENV = "production";
    env.PLANNING_NAMESPACE_ENABLED = "0";
    env.PLANNING_SINGLE_USER_MODE = "1";
    env.PLANNING_USER_ID = "default";

    await writeUserFixture("alice", "Single");

    expect(fs.existsSync(path.join(root, "users", "default", "vault", "profiles", "shared-profile", "profile.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "users", "default", "runs", "index.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "vault", "profiles", "shared-profile", "profile.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, "runs", "index.json"))).toBe(false);
  });
});
