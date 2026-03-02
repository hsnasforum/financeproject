import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  decideActionOnLock,
  isPidRunning,
  readLockFile,
  writeLockFile,
} from "../../scripts/start_local_lock.mjs";

describe("start:local lock helpers", () => {
  let tempRoot = "";

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = "";
    }
  });

  it("decides already_running when pid is alive", () => {
    const decision = decideActionOnLock(
      { pid: 123, startedAt: "2026-03-02T00:00:00.000Z", url: "http://127.0.0.1:3100" },
      true,
    );
    expect(decision.action).toBe("already_running");
    expect(decision.url).toBe("http://127.0.0.1:3100");
  });

  it("decides replace_stale for dead pid or invalid payload", () => {
    const stale = decideActionOnLock(
      { pid: 123, startedAt: "2026-03-02T00:00:00.000Z", url: "http://127.0.0.1:3100" },
      false,
    );
    expect(stale.action).toBe("replace_stale");
    const invalid = decideActionOnLock(null, false);
    expect(invalid.action).toBe("replace_stale");
  });

  it("reads and writes lock payload", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "start-local-lock-"));
    const lockPath = path.join(tempRoot, "runtime.lock");
    await writeLockFile(lockPath, {
      pid: process.pid,
      startedAt: "2026-03-02T00:00:00.000Z",
      url: "http://127.0.0.1:3100",
    });
    const loaded = await readLockFile(lockPath);
    expect(loaded).toMatchObject({
      pid: process.pid,
      url: "http://127.0.0.1:3100",
    });
  });

  it("isPidRunning handles invalid pid safely", () => {
    expect(isPidRunning(-1)).toBe(false);
    expect(isPidRunning(Number.NaN)).toBe(false);
  });
});

