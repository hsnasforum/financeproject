import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  applyNamespaceMigration,
  planMigrations,
  planNamespaceMigration,
} from "../../../src/lib/planning/migrations/runner";

type TempState = {
  dir: string;
};

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function makeTempFixture(): TempState {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-migrations-"));

  writeJson(path.join(dir, ".data/planning/profiles/profile-1.json"), {
    id: "profile-1",
    name: "",
    profile: {
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 600_000,
      liquidAssets: 1_000_000,
      investmentAssets: 2_000_000,
      debts: [],
      goals: [],
    },
    createdAt: "2026-02-28T00:00:00.000Z",
    updatedAt: "2026-02-28T00:00:00.000Z",
  });

  writeJson(path.join(dir, ".data/planning/runs/run-1.json"), {
    id: "run-1",
    profileId: "profile-1",
    createdAt: "2026-02-28T00:00:00.000Z",
    input: { horizonMonths: 120 },
    meta: {
      snapshot: {
        asOf: "2026-02-28",
        fetchedAt: "2026-02-28T00:00:00.000Z",
      },
    },
    outputs: {
      simulate: {
        summary: {},
        warnings: [{ reasonCode: "GOAL_MISSED" }],
      },
    },
  });

  fs.mkdirSync(path.join(dir, ".data/planning/runs"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".data/planning/runs/run-bad.json"), "{invalid", "utf-8");
  writeJson(path.join(dir, ".data/planning/runs/index.json"), {
    version: 1,
    entries: [],
  });

  writeJson(path.join(dir, ".data/planning/assumptions.latest.json"), {
    asOf: "2026-02-28",
    fetchedAt: "2026-02-28T00:00:00.000Z",
    korea: { cpiYoYPct: 2.0 },
    sources: ["https://source.example"],
    warnings: [],
  });

  writeJson(path.join(dir, ".data/planning/assumptions/history/snap-1.json"), {
    version: 1,
    asOf: "2026-02-27",
    fetchedAt: "2026-02-27T00:00:00.000Z",
    korea: { cpiYoYPct: 2.1 },
    sources: [{ name: "BOK", url: "https://bok.example", fetchedAt: "2026-02-27T00:00:00.000Z" }],
    warnings: [],
  });

  return { dir };
}

describe("planning migration runner", () => {
  const temp: TempState[] = [];

  afterEach(() => {
    for (const state of temp.splice(0)) {
      fs.rmSync(state.dir, { recursive: true, force: true });
    }
  });

  it("plans and applies migrations with .bak backup files", async () => {
    const fixture = makeTempFixture();
    temp.push(fixture);

    const plan = await planMigrations({ target: "all", baseDir: fixture.dir });
    expect(plan.scanned).toBeGreaterThanOrEqual(5);
    expect(plan.summary.failedCount).toBeGreaterThanOrEqual(1);
    expect(plan.actions.some((row) => row.path.endsWith("run-bad.json") && row.errors.length > 0)).toBe(true);
    expect(plan.actions.some((row) => row.path.endsWith("runs/index.json"))).toBe(false);
    expect(plan.actions.some((row) => row.path.endsWith("profile-1.json") && row.changed)).toBe(true);
    expect(plan.actions.some((row) => row.path.endsWith("assumptions.latest.json") && row.changed)).toBe(true);

    const applied = await applyMigrations(plan, { baseDir: fixture.dir });
    expect(applied.applied).toBeGreaterThanOrEqual(3);
    expect(applied.failed).toBe(0);

    const profilePath = path.join(fixture.dir, ".data/planning/profiles/profile-1.json");
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf-8")) as { version: number; name: string };
    expect(profile.version).toBe(1);
    expect(profile.name).toBe("Unnamed");
    expect(fs.existsSync(`${profilePath}.bak`)).toBe(true);

    const latestPath = path.join(fixture.dir, ".data/planning/assumptions.latest.json");
    const latest = JSON.parse(fs.readFileSync(latestPath, "utf-8")) as { version: number; sources: Array<{ name: string }> };
    expect(latest.version).toBe(1);
    expect(latest.sources[0]?.name).toBe("https://source.example");
    expect(fs.existsSync(`${latestPath}.bak`)).toBe(true);
  });

  it("plans and applies namespace move from legacy to users/{userId}", async () => {
    const fixture = makeTempFixture();
    temp.push(fixture);

    const namespacePlan = await planNamespaceMigration({
      baseDir: fixture.dir,
      userId: "family-a",
    });
    expect(namespacePlan.scanned).toBeGreaterThanOrEqual(3);
    expect(namespacePlan.summary.failedCount).toBe(0);
    expect(namespacePlan.actions.some((row) => row.toPath.includes("/users/family-a/"))).toBe(true);

    const moved = await applyNamespaceMigration(namespacePlan, {
      baseDir: fixture.dir,
      userId: "family-a",
    });
    expect(moved.failed).toBe(0);
    expect(moved.moved).toBe(namespacePlan.summary.movableCount);

    const legacyProfilePath = path.join(fixture.dir, ".data/planning/profiles/profile-1.json");
    const namespacedProfilePath = path.join(
      fixture.dir,
      ".data/planning/users/family-a/profiles/profile-1.json",
    );
    expect(fs.existsSync(legacyProfilePath)).toBe(false);
    expect(fs.existsSync(`${legacyProfilePath}.bak`)).toBe(true);
    expect(fs.existsSync(namespacedProfilePath)).toBe(true);
  });

  it("can encrypt moved namespace files when passphrase is provided", async () => {
    const fixture = makeTempFixture();
    temp.push(fixture);

    const namespacePlan = await planNamespaceMigration({
      baseDir: fixture.dir,
      userId: "family-b",
    });
    const moved = await applyNamespaceMigration(namespacePlan, {
      baseDir: fixture.dir,
      userId: "family-b",
      encryptionPassphrase: "unit-test-passphrase",
    });
    expect(moved.failed).toBe(0);
    expect(moved.encrypted).toBeGreaterThan(0);

    const namespacedProfilePath = path.join(
      fixture.dir,
      ".data/planning/users/family-b/profiles/profile-1.json",
    );
    const profilePayload = JSON.parse(fs.readFileSync(namespacedProfilePath, "utf-8")) as Record<string, unknown>;
    expect(profilePayload.alg).toBe("aes-256-gcm");
    expect(typeof profilePayload.ciphertext).toBe("string");
  });
});
