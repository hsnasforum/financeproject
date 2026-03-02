import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProfile } from "../../src/lib/planning/store/profileStore";
import { createRun } from "../../src/lib/planning/store/runStore";
import {
  createReportFromRun,
  deleteReport,
  getReport,
  hardDeleteReportFromTrash,
  listReports,
  restoreReportFromTrash,
} from "../../src/lib/planning/reports/storage";
import { listPlanningTrash } from "../../src/lib/planning/store/trash";

const env = process.env as Record<string, string | undefined>;

const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalReportsDir = process.env.PLANNING_REPORTS_DIR;
const originalAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;
const originalAssumptionsHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
const originalTrashDir = process.env.PLANNING_TRASH_DIR;

function profileFixture() {
  return {
    monthlyIncomeNet: 4_500_000,
    monthlyEssentialExpenses: 1_700_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_400_000,
    investmentAssets: 4_200_000,
    debts: [],
    goals: [],
  };
}

describe("planning report storage", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-reports-"));
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_REPORTS_DIR = path.join(root, "reports");
    env.PLANNING_TRASH_DIR = path.join(root, "trash");
    env.PLANNING_ASSUMPTIONS_PATH = path.join(root, "assumptions.latest.json");
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = path.join(root, "assumptions-history");
  });

  afterEach(() => {
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;

    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalReportsDir === "string") env.PLANNING_REPORTS_DIR = originalReportsDir;
    else delete env.PLANNING_REPORTS_DIR;

    if (typeof originalAssumptionsPath === "string") env.PLANNING_ASSUMPTIONS_PATH = originalAssumptionsPath;
    else delete env.PLANNING_ASSUMPTIONS_PATH;

    if (typeof originalAssumptionsHistoryDir === "string") env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalAssumptionsHistoryDir;
    else delete env.PLANNING_ASSUMPTIONS_HISTORY_DIR;

    if (typeof originalTrashDir === "string") env.PLANNING_TRASH_DIR = originalTrashDir;
    else delete env.PLANNING_TRASH_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates/list/reads/deletes report from run", async () => {
    const profile = await createProfile({
      name: "report profile",
      profile: profileFixture(),
    });

    const run = await createRun({
      profileId: profile.id,
      title: "report run",
      input: {
        horizonMonths: 24,
      },
      meta: {
        snapshot: { missing: true },
      },
      outputs: {
        simulate: {
          summary: { endNetWorthKrw: 123_000_000 },
          warnings: [],
          goalsStatus: [],
          keyTimelinePoints: [],
        },
      },
    });

    const created = await createReportFromRun(run.id);
    expect(created.id).toBeTruthy();

    const listed = await listReports();
    expect(listed.length).toBe(1);
    expect(listed[0]?.id).toBe(created.id);
    expect(listed[0]?.runId).toBe(run.id);
    expect(listed[0]?.pathRelative.endsWith(".md")).toBe(true);
    expect(path.isAbsolute(String(listed[0]?.pathRelative))).toBe(false);

    const report = await getReport(created.id);
    expect(report).not.toBeNull();
    expect(report?.meta.id).toBe(created.id);
    expect(report?.meta.runId).toBe(run.id);
    expect(report?.markdown).toContain("# report run");
    expect(report?.markdown).toContain("## Executive Summary");
    expect(report?.markdown).toContain("## Warnings Summary");

    const deleted = await deleteReport(created.id);
    expect(deleted).toBe(true);
    expect(await getReport(created.id)).toBeNull();

    const trashReports = await listPlanningTrash("reports", 50, root);
    expect(trashReports.some((item) => item.id === created.id)).toBe(true);

    const restored = await restoreReportFromTrash(created.id);
    expect(restored).toBe(true);
    expect(await getReport(created.id)).not.toBeNull();

    await deleteReport(created.id);
    const hardDeleted = await hardDeleteReportFromTrash(created.id);
    expect(hardDeleted).toBe(true);
    expect(await listPlanningTrash("reports", 50, root)).toHaveLength(0);
  });
});
