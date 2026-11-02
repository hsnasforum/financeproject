import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { createFinlifeLegacyFixture, snapshotDatabase } from "./helpers/finlifeLegacyDatabase";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finlife-cli-"));
  roots.push(root);
  const databasePath = path.join(root, "legacy.sqlite");
  createFinlifeLegacyFixture(databasePath);
  fs.mkdirSync(path.join(root, "vault"));
  return { root, databasePath, env: { ...process.env, DATABASE_URL: "file:" + databasePath, PLANNING_DATA_DIR: path.join(root, "vault"), NODE_ENV: "test" as const } };
}
it("inspects without writes and rejects direct apply or target overrides", () => {
  const input = setup();
  const before = fs.readFileSync(input.databasePath);
  const inspect = spawnSync(process.execPath, ["scripts/finlife_identity_migrate.mjs"], { env: input.env, encoding: "utf8" });
  expect(inspect.status, inspect.stderr).toBe(0);
  expect(JSON.parse(inspect.stdout)).toMatchObject({ status: "required", mode: "inspect", productCount: 1 });
  const direct = spawnSync(process.execPath, ["scripts/finlife_identity_migrate.mjs", "--apply"], { env: input.env, encoding: "utf8" });
  expect(direct.status).toBe(1);
  expect(JSON.parse(direct.stderr).code).toBe("MIGRATION_WRITER_REQUIRED");
  const override = spawnSync(process.execPath, ["scripts/finlife_identity_migrate.mjs", "--database", input.databasePath], { env: input.env, encoding: "utf8" });
  expect(override.status).toBe(1);
  expect(fs.readFileSync(input.databasePath)).toEqual(before);
});
it("runs the canonical registered writer and reopens preserved favorite/profile/report data", () => {
  const input = setup();
  const before = snapshotDatabase(input.databasePath);
  const run = () => spawnSync(process.execPath, ["scripts/planning_writer_entry.mjs", "finlife:identity:migrate:apply", "--", process.execPath, "scripts/finlife_identity_migrate.mjs", "--apply"], { env: input.env, encoding: "utf8" });
  const first = run();
  expect(first.status, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout)).toMatchObject({ status: "ready", applied: true });
  expect(snapshotDatabase(input.databasePath, { omitIdentity: true })).toEqual(before);
  const second = run();
  expect(second.status, second.stderr).toBe(0);
  expect(JSON.parse(second.stdout)).toMatchObject({ status: "ready", applied: false });
});
