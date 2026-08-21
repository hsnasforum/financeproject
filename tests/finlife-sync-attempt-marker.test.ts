import fs from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSyncAttempt,
  readSyncAttempt,
  writeSnapshot,
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

  it("keeps final completion evidence failures observable", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-finlife-sync-attempt-"));
    tempRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const attempt = {
      status: "failed",
      phase: "completion",
      startedAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:02.000Z",
      errorCode: "COMPLETION_WRITE_FAILED",
    } as const;

    writeSyncAttempt("saving", attempt);

    expect(readSyncAttempt("saving")).toEqual(attempt);
    expect(loadFinlifeSyncAttempt("saving")).toEqual(attempt);
  });

  it("uses unique operation-owned temp names for both CLI writers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-finlife-sync-attempt-"));
    tempRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const writePaths: string[] = [];
    const realWriteFileSync = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "writeFileSync").mockImplementation(((target: fs.PathOrFileDescriptor, data: string, options: BufferEncoding) => {
      writePaths.push(String(target));
      return realWriteFileSync(target, data, options);
    }) as typeof fs.writeFileSync);

    writeSnapshot("deposit", { meta: { generatedAt: "2026-07-16T00:00:00.000Z" }, items: [] });
    writeSyncAttempt("deposit", {
      status: "running",
      phase: "db",
      startedAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    });

    expect(writePaths).toHaveLength(2);
    expect(writePaths.every((file) => file.includes(`.tmp-${process.pid}-`))).toBe(true);
    expect(new Set(writePaths).size).toBe(2);
  });

  it("preserves the CLI canonical snapshot and cleans its own temp after rename failure", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-finlife-sync-attempt-"));
    tempRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const file = path.join(root, ".data", "finlife_deposit_snapshot.json");
    writeSnapshot("deposit", { meta: { generatedAt: "2026-07-16T00:00:00.000Z" }, items: [{ fin_prdt_cd: "FIN-001", options: [] }] });
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("rename failed");
    });

    expect(() => writeSnapshot("deposit", { meta: { generatedAt: "2026-07-16T00:00:01.000Z" }, items: [{ fin_prdt_cd: "FIN-002", options: [] }] })).toThrow("rename failed");
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).items[0]?.fin_prdt_cd).toBe("FIN-001");
    expect(fs.readdirSync(path.dirname(file)).filter((name) => name.startsWith(`${path.basename(file)}.tmp`))).toEqual([]);
  });

  it("keeps concurrent CLI writers on complete JSON without shared temp collisions", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-finlife-sync-attempt-"));
    tempRoots.push(root);
    const moduleUrl = new URL("../scripts/finlife_cli_common.mjs", import.meta.url).href;
    const writerIds = ["FIN-001", "FIN-002", "FIN-003", "FIN-004"];

    await Promise.all(writerIds.map((writerId) => new Promise<void>((resolve, reject) => {
      const script = [
        `import { writeSnapshot } from ${JSON.stringify(moduleUrl)};`,
        `const payload = { meta: { generatedAt: "2026-07-16T00:00:00.000Z" }, items: [{ fin_prdt_cd: ${JSON.stringify(writerId)}, options: [], raw: { padding: "x".repeat(262144) } }] };`,
        "for (let index = 0; index < 10; index += 1) writeSnapshot('deposit', payload);",
      ].join("\n");
      const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
        cwd: root,
        env: process.env,
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`writer ${writerId} exited ${code}: ${stderr}`));
      });
    })));

    const dataDir = path.join(root, ".data");
    const canonical = JSON.parse(fs.readFileSync(path.join(dataDir, "finlife_deposit_snapshot.json"), "utf-8"));
    expect(writerIds).toContain(canonical.items[0]?.fin_prdt_cd);
    expect(fs.readdirSync(dataDir).filter((name) => name.includes(".tmp"))).toEqual([]);
  });
});
