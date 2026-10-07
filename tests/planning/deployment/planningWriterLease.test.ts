import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquirePlanningWriterLease,
  PLANNING_WRITER_LEASE_ERROR_CODES,
  registerPlanningWriterLeaseChild,
  verifyPlanningWriterLeaseCapability,
} from "../../../src/lib/planning/deployment/writerLease.mjs";
import { spawnRegisteredPlanningWriterChild } from "../../../scripts/planning_writer_child.mjs";

const fixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/planning-writer-lease-holder.mjs",
);
const temporaryDirectories: string[] = [];
const liveChildren = new Set<ChildProcess>();

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "planning-writer-lease-"));
  temporaryDirectories.push(directory);
  return directory;
}

function spawnFixture(args: string[]) {
  const child = spawn(process.execPath, [fixturePath, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  liveChildren.add(child);
  child.once("exit", () => liveChildren.delete(child));
  return child;
}

function firstJsonLine(child: ChildProcessWithoutNullStreams) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const onStdout = (chunk: Buffer | string) => {
      stdout += chunk.toString();
      const newline = stdout.indexOf("\n");
      if (newline < 0) return;
      cleanup();
      try {
        resolve(JSON.parse(stdout.slice(0, newline)) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    };
    const onStderr = (chunk: Buffer | string) => {
      stderr += chunk.toString();
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`fixture exited ${code}: ${stderr}`));
    };
    const cleanup = () => {
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
  });
}

function waitForExit(child: ChildProcess) {
  return new Promise<number | null>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once("exit", (code) => resolve(code));
  });
}

async function waitForPath(filePath: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`timed out waiting for ${filePath}`);
}

async function waitForPidToExit(pid: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      throw error;
    }
  }
  throw new Error(`timed out waiting for pid ${pid} to exit`);
}

afterEach(async () => {
  for (const child of liveChildren) {
    child.kill("SIGKILL");
  }
  await Promise.all([...liveChildren].map(waitForExit));
  liveChildren.clear();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("planning writer lease", () => {
  it("creates the exact public payload under the canonical data root without serializing its secret", async () => {
    const parent = await temporaryDirectory();
    const dataRoot = path.join(parent, "data");
    const ownerToken = "test-owner-token-that-must-never-be-written";
    const handle = await acquirePlanningWriterLease({
      dataRoot,
      writerId: "unit-test",
      ownerToken,
    });

    const lockPath = path.join(handle.dataRoot, "runtime", "writer-lease.json");
    const source = await readFile(lockPath, "utf8");
    const payload = JSON.parse(source) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual([
      "childPids",
      "createdAt",
      "dataRoot",
      "hostname",
      "leaseId",
      "ownerTokenHash",
      "pid",
      "version",
      "writerId",
    ]);
    expect(payload).toEqual(JSON.parse(JSON.stringify(handle)));
    expect(source).not.toContain(ownerToken);
    expect(JSON.stringify(handle)).not.toContain(ownerToken);
    expect(Object.keys(handle)).not.toContain("capability");
    expect(handle.capability).toContain(ownerToken);
    const lockStat = fs.lstatSync(lockPath);
    expect(lockStat.isFile()).toBe(true);
    expect(lockStat.isSymbolicLink()).toBe(false);
    if (process.platform !== "win32") {
      expect(lockStat.mode & 0o077).toBe(0);
    }

    await expect(handle.release()).resolves.toBe(true);
    await expect(handle.release()).resolves.toBe(false);
  });

  it("treats realpath aliases as the same root and allows a different root", async () => {
    const parent = await temporaryDirectory();
    const canonicalRoot = path.join(parent, "canonical");
    const aliasRoot = path.join(parent, "alias");
    const otherRoot = path.join(parent, "other");
    await mkdir(canonicalRoot);
    await symlink(
      canonicalRoot,
      aliasRoot,
      process.platform === "win32" ? "junction" : "dir",
    );

    const first = await acquirePlanningWriterLease({
      dataRoot: aliasRoot,
      writerId: "first",
    });
    const other = await acquirePlanningWriterLease({
      dataRoot: otherRoot,
      writerId: "other",
    });

    expect(first.dataRoot).toBe(await fs.promises.realpath(canonicalRoot));
    await expect(acquirePlanningWriterLease({
      dataRoot: canonicalRoot,
      writerId: "second",
    })).rejects.toMatchObject({
      code: PLANNING_WRITER_LEASE_ERROR_CODES.HELD,
    });
    expect(other.dataRoot).not.toBe(first.dataRoot);

    await Promise.all([first.release(), other.release()]);
  });

  it("verifies only the capability bound to the current lease id and owner token", async () => {
    const dataRoot = await temporaryDirectory();
    const handle = await acquirePlanningWriterLease({ dataRoot, writerId: "verify" });

    await expect(verifyPlanningWriterLeaseCapability({
      dataRoot,
      capability: handle.capability,
    })).resolves.toMatchObject({ leaseId: handle.leaseId });
    await expect(verifyPlanningWriterLeaseCapability({
      dataRoot,
      capability: `${handle.capability}-wrong`,
    })).rejects.toMatchObject({
      code: PLANNING_WRITER_LEASE_ERROR_CODES.CAPABILITY_INVALID,
    });

    await handle.release();
  });

  it("never removes a lease whose token hash no longer matches the in-memory owner", async () => {
    const dataRoot = await temporaryDirectory();
    const handle = await acquirePlanningWriterLease({
      dataRoot,
      writerId: "release-owner",
      ownerToken: "correct-owner-token",
    });
    const lockPath = path.join(handle.dataRoot, "runtime", "writer-lease.json");
    const payload = JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>;
    payload.ownerTokenHash = createHash("sha256").update("wrong-owner-token").digest("hex");
    await writeFile(lockPath, `${JSON.stringify(payload)}\n`);

    await expect(handle.release()).rejects.toMatchObject({
      code: PLANNING_WRITER_LEASE_ERROR_CODES.RELEASE_NOT_OWNER,
    });
    await expect(access(lockPath)).resolves.toBeUndefined();
  });

  it("fails closed for malformed, foreign-host, and live-owner leases", async () => {
    const malformedRoot = await temporaryDirectory();
    const malformedRuntime = path.join(malformedRoot, "runtime");
    await mkdir(malformedRuntime);
    await writeFile(path.join(malformedRuntime, "writer-lease.json"), "not-json\n");
    await expect(acquirePlanningWriterLease({
      dataRoot: malformedRoot,
      writerId: "malformed-contender",
    })).rejects.toMatchObject({ code: PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED });

    const foreignRoot = await temporaryDirectory();
    const foreign = await acquirePlanningWriterLease({
      dataRoot: foreignRoot,
      writerId: "foreign",
      hostname: `${os.hostname()}-foreign`,
    });
    await expect(acquirePlanningWriterLease({
      dataRoot: foreignRoot,
      writerId: "local",
    })).rejects.toMatchObject({ code: PLANNING_WRITER_LEASE_ERROR_CODES.FOREIGN_HOST });
    await foreign.release();

    const liveRoot = await temporaryDirectory();
    const live = await acquirePlanningWriterLease({ dataRoot: liveRoot, writerId: "live" });
    await expect(acquirePlanningWriterLease({
      dataRoot: liveRoot,
      writerId: "contender",
    })).rejects.toMatchObject({ code: PLANNING_WRITER_LEASE_ERROR_CODES.HELD });
    await live.release();
  });

  it("fails closed when the same-host owner pid cannot be inspected", async () => {
    const dataRoot = await temporaryDirectory();
    const unknownPid = 42_424_242;
    const handle = await acquirePlanningWriterLease({
      dataRoot,
      writerId: "unknown-owner",
      pid: unknownPid,
    });
    const originalKill = process.kill;
    const killSpy = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: unknown) => {
      if (pid === unknownPid) {
        throw Object.assign(new Error("permission denied"), { code: "EPERM" });
      }
      return Reflect.apply(originalKill, process, [pid, signal]);
    }) as typeof process.kill);

    try {
      await expect(acquirePlanningWriterLease({
        dataRoot,
        writerId: "must-fail-closed",
      })).rejects.toMatchObject({
        code: PLANNING_WRITER_LEASE_ERROR_CODES.OWNER_UNKNOWN,
      });
    } finally {
      killSpy.mockRestore();
    }
    await handle.release();
  });

  it("recovers a same-host lease only after its real owner child is dead", async () => {
    const dataRoot = await temporaryDirectory();
    const holder = spawnFixture(["hold", dataRoot, "dead-holder"]);
    const ready = await firstJsonLine(holder);
    expect(ready.ok).toBe(true);
    holder.kill("SIGKILL");
    await waitForExit(holder);

    const recovered = await acquirePlanningWriterLease({
      dataRoot,
      writerId: "recovered-owner",
    });
    expect(recovered.leaseId).not.toBe(ready.leaseId);
    await recovered.release();
  });

  it("atomically registers a runtime child and blocks recovery while that child is alive", async () => {
    const dataRoot = await temporaryDirectory();
    const holder = spawnFixture(["parent-with-child", dataRoot, "runtime-parent"]);
    const ready = await firstJsonLine(holder);
    expect(ready.ok).toBe(true);
    const childPid = ready.childPid as number;
    expect(ready.childPids).toEqual([childPid]);

    holder.kill("SIGKILL");
    await waitForExit(holder);
    try {
      await expect(acquirePlanningWriterLease({
        dataRoot,
        writerId: "must-not-steal",
      })).rejects.toMatchObject({ code: PLANNING_WRITER_LEASE_ERROR_CODES.HELD });
    } finally {
      try {
        process.kill(childPid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      await waitForPidToExit(childPid);
    }
    const recovered = await acquirePlanningWriterLease({
      dataRoot,
      writerId: "after-runtime-child",
    });
    await recovered.release();
  });

  it("registers the actual runtime process and waits for it after signaling only the bootstrap", async () => {
    const dataRoot = await temporaryDirectory();
    const handle = await acquirePlanningWriterLease({ dataRoot, writerId: "registered-process-tree" });
    const child = await spawnRegisteredPlanningWriterChild({
      dataRoot: handle.dataRoot,
      capability: handle.capability,
      command: process.execPath,
      args: ["--input-type=module", "--eval", "setInterval(() => undefined, 60000);"],
      cwd: process.cwd(),
      env: process.env,
      detached: false,
    }) as ChildProcess & { runtimePid: number };
    liveChildren.add(child);
    child.once("exit", () => liveChildren.delete(child));

    const active = await verifyPlanningWriterLeaseCapability({
      dataRoot,
      capability: handle.capability,
    });
    expect(active.childPids).toEqual(expect.arrayContaining([child.pid, child.runtimePid]));

    child.kill("SIGTERM");
    await waitForExit(child);
    await waitForPidToExit(child.runtimePid);
    await expect(handle.release()).resolves.toBe(true);
  });

  it("force-stops an unregistered runtime before reporting registration failure", async () => {
    const dataRoot = await temporaryDirectory();
    const pidPath = path.join(dataRoot, "registration-failure-runtime.pid");
    const signalPath = path.join(dataRoot, "registration-failure-runtime.sigterm");
    const handle = await acquirePlanningWriterLease({
      dataRoot,
      writerId: "registration-failure-cleanup",
    });
    const descendantSource = "process.on('SIGTERM', () => {});setInterval(() => undefined, 60000);";
    const runtimeSource = [
      "const fs = require('node:fs');",
      ...(process.platform === "win32" ? [
        "const { spawn } = require('node:child_process');",
        `const descendant = spawn(process.execPath, ['--eval', ${JSON.stringify(descendantSource)}], { detached: true, stdio: 'ignore' });`,
        "descendant.unref();",
        `fs.writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify({ runtimePid: process.pid, descendantPid: descendant.pid }));`,
      ] : [
        `fs.writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify({ runtimePid: process.pid }));`,
      ]),
      `process.on('SIGTERM', () => fs.writeFileSync(${JSON.stringify(signalPath)}, 'received'));`,
      "setInterval(() => undefined, 60000);",
    ].join("");

    await expect(spawnRegisteredPlanningWriterChild({
      dataRoot: handle.dataRoot,
      capability: handle.capability,
      command: process.execPath,
      args: ["--eval", runtimeSource],
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test" },
      detached: false,
      testFailRuntimeRegistration: true,
      testRuntimeReadyPath: pidPath,
    })).rejects.toThrow("test-injected planning writer runtime registration failure");

    const runtimePids = JSON.parse(await readFile(pidPath, "utf8")) as {
      runtimePid: number;
      descendantPid?: number;
    };
    expect(Number.isInteger(runtimePids.runtimePid)).toBe(true);
    if (process.platform !== "win32") {
      await expect(access(signalPath)).resolves.toBeUndefined();
    }
    await waitForPidToExit(runtimePids.runtimePid);
    if (runtimePids.descendantPid) await waitForPidToExit(runtimePids.descendantPid);
    await expect(handle.release()).resolves.toBe(true);
  }, 15_000);

  it.skipIf(process.platform !== "win32")(
    "retains the lease when a failed runtime exits before its Windows tree can be proven stopped",
    async () => {
      const dataRoot = await temporaryDirectory();
      const pidPath = path.join(dataRoot, "early-exit-runtime-tree.json");
      const handle = await acquirePlanningWriterLease({
        dataRoot,
        writerId: "early-exit-registration-failure",
      });
      const descendantSource = "setInterval(() => undefined, 60000);";
      const runtimeSource = [
        "const fs = require('node:fs');",
        "const { spawn } = require('node:child_process');",
        `const descendant = spawn(process.execPath, ['--eval', ${JSON.stringify(descendantSource)}], { stdio: 'ignore' });`,
        `fs.writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify({ runtimePid: process.pid, descendantPid: descendant.pid }));`,
        "process.exit(0);",
      ].join("");
      const outcomePromise = spawnRegisteredPlanningWriterChild({
        dataRoot: handle.dataRoot,
        capability: handle.capability,
        command: process.execPath,
        args: ["--eval", runtimeSource],
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "test" },
        detached: false,
        testFailRuntimeRegistration: true,
        testRuntimeReadyPath: pidPath,
        testWaitForRuntimeExitBeforeRegistrationFailure: true,
      }).then(
        () => ({ status: "resolved" as const }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );

      await waitForPath(pidPath);
      const runtimePids = JSON.parse(await readFile(pidPath, "utf8")) as {
        runtimePid: number;
        descendantPid: number;
      };
      await waitForPidToExit(runtimePids.runtimePid);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const pending = await Promise.race([
        outcomePromise,
        new Promise<{ status: "pending" }>((resolve) => {
          setTimeout(() => resolve({ status: "pending" }), 250);
        }),
      ]);
      expect(pending.status).toBe("pending");

      const active = await verifyPlanningWriterLeaseCapability({
        dataRoot,
        capability: handle.capability,
      });
      const bootstrapPid = active.childPids[0];
      expect(Number.isInteger(bootstrapPid)).toBe(true);

      for (const pid of [runtimePids.descendantPid, bootstrapPid]) {
        if (!pid) continue;
        try {
          process.kill(pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      await waitForPidToExit(runtimePids.descendantPid);
      if (bootstrapPid) await waitForPidToExit(bootstrapPid);
      expect((await outcomePromise).status).toBe("rejected");
      await expect(handle.release()).resolves.toBe(true);
    },
    15_000,
  );

  it("registers child pids only with the current capability", async () => {
    const dataRoot = await temporaryDirectory();
    const handle = await acquirePlanningWriterLease({ dataRoot, writerId: "register" });

    await expect(registerPlanningWriterLeaseChild({
      dataRoot,
      capability: `${handle.capability}-wrong`,
      childPid: process.pid,
    })).rejects.toMatchObject({
      code: PLANNING_WRITER_LEASE_ERROR_CODES.CAPABILITY_INVALID,
    });
    const updated = await registerPlanningWriterLeaseChild({
      dataRoot,
      capability: handle.capability,
      childPid: process.pid,
    });
    expect(updated.childPids).toEqual([process.pid]);
    const stored = JSON.parse(await readFile(
      path.join(handle.dataRoot, "runtime", "writer-lease.json"),
      "utf8",
    )) as { childPids: number[] };
    expect(stored.childPids).toEqual([process.pid]);

    await handle.release();
  });

  it("recovers stale update and recovery mutexes only after their same-host owner is dead", async () => {
    const stalePid = 2_147_000_000;
    const originalKill = process.kill;
    const killSpy = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: unknown) => {
      if (pid === stalePid) {
        throw Object.assign(new Error("process not found"), { code: "ESRCH" });
      }
      return Reflect.apply(originalKill, process, [pid, signal]);
    }) as typeof process.kill);

    try {
      const updateRoot = await temporaryDirectory();
      const active = await acquirePlanningWriterLease({ dataRoot: updateRoot, writerId: "update-owner" });
      const updatePath = path.join(active.dataRoot, "runtime", "writer-lease.update");
      await writeFile(updatePath, `${JSON.stringify({
        version: 1,
        kind: "update",
        pid: stalePid,
        hostname: os.hostname(),
        mutexId: "stale-update-mutex",
        createdAt: new Date().toISOString(),
      })}\n`);
      await expect(registerPlanningWriterLeaseChild({
        dataRoot: active.dataRoot,
        capability: active.capability,
        childPid: process.pid,
      })).resolves.toMatchObject({ childPids: [process.pid] });
      await active.release();

      const recoveryRoot = await temporaryDirectory();
      const staleOwner = await acquirePlanningWriterLease({
        dataRoot: recoveryRoot,
        writerId: "stale-owner",
        pid: stalePid,
      });
      const recoveryPath = path.join(staleOwner.dataRoot, "runtime", "writer-lease.recovery");
      await writeFile(recoveryPath, `${JSON.stringify({
        version: 1,
        kind: "recovery",
        pid: stalePid,
        hostname: os.hostname(),
        mutexId: "stale-recovery-mutex",
        createdAt: new Date().toISOString(),
      })}\n`);
      const recovered = await acquirePlanningWriterLease({
        dataRoot: recoveryRoot,
        writerId: "recovered-after-mutex-crash",
      });
      expect(recovered.leaseId).not.toBe(staleOwner.leaseId);
      await recovered.release();
    } finally {
      killSpy.mockRestore();
    }
  });

  it("fails closed instead of deleting a malformed mutex", async () => {
    const dataRoot = await temporaryDirectory();
    const handle = await acquirePlanningWriterLease({ dataRoot, writerId: "malformed-mutex" });
    const updatePath = path.join(handle.dataRoot, "runtime", "writer-lease.update");
    await writeFile(updatePath, "not-json\n");

    await expect(registerPlanningWriterLeaseChild({
      dataRoot,
      capability: handle.capability,
      childPid: process.pid,
    })).rejects.toMatchObject({ code: PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED });
    await expect(access(updatePath)).resolves.toBeUndefined();

    await rm(updatePath, { force: true });
    await handle.release();
  });

  it("allows only one winner when two real Node processes compete for one root", async () => {
    const parent = await temporaryDirectory();
    const dataRoot = path.join(parent, "shared-root");
    const startPath = path.join(parent, "start");
    const readyOne = path.join(parent, "ready-one");
    const readyTwo = path.join(parent, "ready-two");
    const first = spawnFixture(["compete", dataRoot, "child-one", readyOne, startPath, "750"]);
    const second = spawnFixture(["compete", dataRoot, "child-two", readyTwo, startPath, "750"]);
    const firstResultPromise = firstJsonLine(first);
    const secondResultPromise = firstJsonLine(second);
    await Promise.all([waitForPath(readyOne), waitForPath(readyTwo)]);
    await writeFile(startPath, "start\n", { flag: "wx" });

    const results = await Promise.all([firstResultPromise, secondResultPromise]);
    await Promise.all([waitForExit(first), waitForExit(second)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect([
      PLANNING_WRITER_LEASE_ERROR_CODES.HELD,
      PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
    ]).toContain(results.find((result) => !result.ok)?.code);
  });
});
