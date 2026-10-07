import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import {
  acquirePlanningWriterLease,
  registerPlanningWriterLeaseChild,
} from "../../src/lib/planning/deployment/writerLease.mjs";

const [mode, dataRoot, writerId, ...rest] = process.argv.slice(2);

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function waitForever() {
  setInterval(() => undefined, 60_000);
}

async function waitForFile(filePath) {
  while (true) {
    try {
      await import("node:fs/promises").then(({ access }) => access(filePath));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

try {
  if (mode === "hold") {
    const handle = await acquirePlanningWriterLease({ dataRoot, writerId });
    output({ ok: true, pid: process.pid, leaseId: handle.leaseId });
    waitForever();
  } else if (mode === "compete") {
    const [readyPath, startPath, holdMillisecondsText] = rest;
    await writeFile(readyPath, "ready\n", { flag: "wx" });
    await waitForFile(startPath);
    try {
      const handle = await acquirePlanningWriterLease({ dataRoot, writerId });
      output({ ok: true, pid: process.pid, leaseId: handle.leaseId });
      await new Promise((resolve) => setTimeout(resolve, Number(holdMillisecondsText)));
      await handle.release();
    } catch (error) {
      output({ ok: false, code: error?.code ?? "UNKNOWN" });
    }
  } else if (mode === "parent-with-child") {
    const handle = await acquirePlanningWriterLease({ dataRoot, writerId });
    const child = spawn(process.execPath, [
      "--input-type=module",
      "--eval",
      "setInterval(() => undefined, 60000);",
    ], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    if (!child.pid) throw new Error("child pid unavailable");
    const metadata = await registerPlanningWriterLeaseChild({
      dataRoot,
      capability: handle.capability,
      childPid: child.pid,
    });
    output({
      ok: true,
      pid: process.pid,
      childPid: child.pid,
      childPids: metadata.childPids,
    });
    waitForever();
  } else {
    throw new Error(`unsupported fixture mode: ${mode}`);
  }
} catch (error) {
  output({ ok: false, code: error?.code ?? "UNKNOWN" });
  process.exitCode = 1;
}
