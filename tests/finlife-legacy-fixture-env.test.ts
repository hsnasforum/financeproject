import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawn = vi.hoisted(() => ({ calls: [] as Array<{ env?: NodeJS.ProcessEnv }> }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    // Record the child env and fail, so no schema is cached and no database file is opened.
    spawnSync: vi.fn((_command: string, _args: string[], options: { env?: NodeJS.ProcessEnv }) => {
      spawn.calls.push({ env: options?.env });
      return { status: 1, stdout: "", stderr: "recorded" };
    }),
  };
});

async function freshFixtureModule() {
  vi.resetModules();
  return import("./helpers/finlifeLegacyDatabase");
}

describe("finlife legacy fixture child env", () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    spawn.calls.length = 0;
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it.each([
    { name: "no inherited DATABASE_URL", inherited: undefined },
    { name: "another disposable DATABASE_URL", inherited: "file:/tmp/other-disposable/unused.db" },
  ])("gives prisma only this fixture's file URL with $name", async ({ inherited }) => {
    if (inherited === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = inherited;
    const databasePath = path.join("/tmp", "finance-fixture-env-check", "legacy.db");
    const { createFinlifeLegacyFixture } = await freshFixtureModule();

    expect(() => createFinlifeLegacyFixture(databasePath)).toThrow("fixture schema generation failed: recorded");
    expect(spawn.calls).toHaveLength(1);
    expect(spawn.calls[0].env?.DATABASE_URL).toBe(pathToFileURL(databasePath).href);
    // Only the child env changes; the test process keeps its own value.
    expect(process.env.DATABASE_URL).toBe(inherited);
  });
});
