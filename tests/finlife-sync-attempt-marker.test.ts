import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSyncAttempt,
  readSyncAttempt,
  writeSyncAttempt,
} from "../scripts/finlife_cli_common.mjs";
import { loadFinlifeSyncAttempt } from "../src/lib/finlife/snapshot";

const tempRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("FINLIFE sync attempt marker", () => {
  it("keeps CLI and runtime readers on the same atomic marker contract", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-finlife-sync-attempt-"));
    tempRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const attempt = {
      status: "failed",
      phase: "db",
      startedAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:01.000Z",
      errorCode: "DB_SYNC_FAILED",
    } as const;

    writeSyncAttempt("deposit", attempt);

    expect(readSyncAttempt("deposit")).toEqual(attempt);
    expect(loadFinlifeSyncAttempt("deposit")).toEqual(attempt);
    expect(fs.existsSync(path.join(root, ".data", "finlife_deposit_sync_attempt.json.tmp"))).toBe(false);

    clearSyncAttempt("deposit");

    expect(readSyncAttempt("deposit")).toBeNull();
    expect(loadFinlifeSyncAttempt("deposit")).toBeNull();
  });
});
