import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFinlifeSyncAttempt } from "../src/lib/finlife/snapshot";
import { getUnifiedSourceStatuses } from "../src/lib/sources/status";
vi.mock("@/lib/db/prisma", () => ({ prisma: { externalSourceSnapshot: { findUnique: async () => null }, $queryRawUnsafe: async () => [] } }));
import { DESKTOP_PROVENANCE_VERSION } from "../scripts/planning_v2_desktop_provenance.mjs";
import {
  PUBLIC_SNAPSHOT_FILES,
  copyPublicSnapshots,
  prepareSourceSnapshotAssets,
  preparePublicSnapshotRuntime,
  assertPublicSnapshotDirectory,
  assertManagedSnapshotEntries,
} from "../scripts/public_snapshot_assets.mjs";

const roots: string[] = [];
const create = () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "public-snapshot-assets-"));
  roots.push(cwd);
  const standalone = path.join(cwd, ".next", "standalone");
  fs.mkdirSync(standalone, { recursive: true });
  fs.writeFileSync(path.join(standalone, "server.js"), "// test-only\n");
  fs.mkdirSync(path.join(cwd, ".data"));
  return { cwd, standalone, standaloneServer: path.join(standalone, "server.js") };
};
function seed(root: string, value: string) {
  fs.mkdirSync(root, { recursive: true });
  for (const name of PUBLIC_SNAPSHOT_FILES) fs.writeFileSync(path.join(root, name), JSON.stringify({ testOnly: true, value }));
}
function link(source: string, target: string) {
  fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
// Test-only managed installation identity (same fields as the existing managed case below).
function makeManaged(cwd: string) {
  const write = (p: string, data: string) => { fs.mkdirSync(path.dirname(path.join(cwd, p)), { recursive: true }); fs.writeFileSync(path.join(cwd, p), data); };
  write("package.json", JSON.stringify({ version: "1.0.0" }));
  write("pnpm-lock.yaml", "test-only-lock\n"); write(".env.local.example", "# test only\n");
  write("scripts/planning_desktop_install_state.mjs", ""); write("scripts/planning_v2_desktop_uninstall.mjs", "");
  write("desktop-manifest.json", JSON.stringify({ kind: "planning-v2-desktop", provenanceVersion: DESKTOP_PROVENANCE_VERSION, version: "1.0.0", packageVersion: "1.0.0", gitSha: "1".repeat(40), platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules, lockfileSha256: crypto.createHash("sha256").update("test-only-lock\n").digest("hex"), artifactChecksum: { algorithm: "sha256", value: "1".repeat(64), fileCount: 1, totalBytes: 1, excludes: ["desktop-manifest.json"] } }));
}
// Entries a running app may write into the generated data directory (synthetic, test-only).
function writeRuntimeEntries(dataDir: string) {
  const entries = {
    "scenarios/overrides.json": JSON.stringify({ schemaVersion: 1, items: [], testOnly: true }),
    "benefits_snapshot.json.tmp-123-test-only": "TEST_ONLY_PARTIAL",
    ".snapshot-test-only.tmp": "TEST_ONLY_LEFTOVER",
  };
  for (const [relative, text] of Object.entries(entries)) {
    fs.mkdirSync(path.dirname(path.join(dataDir, relative)), { recursive: true });
    fs.writeFileSync(path.join(dataDir, relative), text);
  }
  return entries;
}
function writeRootSnapshot(cwd: string, kind: string, generatedAt: unknown) {
  fs.writeFileSync(path.join(cwd, ".data", `finlife_${kind}_snapshot.json`), JSON.stringify({ meta: { generatedAt, ttlMs: 3600000, source: "finlife", fallbackUsed: false, completionRate: 1, truncatedByHardCap: false }, items: [] }));
}
const attemptText = (status: string, phase: string, updatedAt: string, errorCode?: string) =>
  JSON.stringify({ status, phase, startedAt: "2026-10-18T00:05:00.000Z", updatedAt, ...(errorCode ? { errorCode } : {}) });
const readAll = (dataDir: string, entries: Record<string, string>) => Object.fromEntries(Object.keys(entries).map((r) => [r, fs.readFileSync(path.join(dataDir, r), "utf8")]));

describe("public snapshot asset boundary", () => {
  it("keeps a failed CLI attempt visible through the actual reader and source status", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    const generatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(f.cwd, ".data", "finlife_deposit_snapshot.json"), JSON.stringify({ meta: { generatedAt, ttlMs: 3600000, source: "finlife", fallbackUsed: false, completionRate: 1, truncatedByHardCap: false }, items: [] }));
    fs.writeFileSync(path.join(f.cwd, ".data", "finlife_deposit_sync_attempt.json"), JSON.stringify({ status: "failed", phase: "snapshot", startedAt: generatedAt, updatedAt: generatedAt, errorCode: "SNAPSHOT_WRITE_FAILED" }));
    prepareSourceSnapshotAssets(f);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(f.standalone);
    try {
      expect(loadFinlifeSyncAttempt("deposit")?.status).toBe("failed");
      const status = (await getUnifiedSourceStatuses()).find(row => row.sourceId === "finlife" && row.kind === "deposit");
      expect(status?.isFresh).toBe(false);
      expect(status?.lastError?.message).toContain("동기화가 완료되지 않았습니다");
    } finally { cwd.mockRestore(); }
  });

  it("copies only the canonical nine regular files and preserves private source canaries", () => {
    const f = create();
    seed(path.join(f.cwd, ".data"), "A");
    fs.writeFileSync(path.join(f.cwd, ".data", "journal-private.json"), "TEST_ONLY_PRIVATE");
    copyPublicSnapshots({ cwd: f.cwd, standaloneServer: f.standaloneServer, required: true });
    expect(fs.readdirSync(path.join(f.standalone, ".data")).sort()).toEqual([...PUBLIC_SNAPSHOT_FILES].sort());
    expect(fs.readFileSync(path.join(f.cwd, ".data", "journal-private.json"), "utf8")).toBe("TEST_ONLY_PRIVATE");
    for (const n of PUBLIC_SNAPSHOT_FILES) expect(fs.lstatSync(path.join(f.standalone, ".data", n)).isSymbolicLink()).toBe(false);
  });
  it("replaces A with B at restart and removes a missing source's stale generated copy", async () => {
    const f = create();
    seed(path.join(f.cwd, ".data"), "A");
    await preparePublicSnapshotRuntime(f);
    seed(path.join(f.cwd, ".data"), "B");
    await preparePublicSnapshotRuntime(f);
    expect(JSON.parse(fs.readFileSync(path.join(f.standalone, ".data", PUBLIC_SNAPSHOT_FILES[0]), "utf8")).value).toBe("B");
    fs.unlinkSync(path.join(f.cwd, ".data", PUBLIC_SNAPSHOT_FILES[0]));
    await preparePublicSnapshotRuntime(f);
    expect(fs.existsSync(path.join(f.standalone, ".data", PUBLIC_SNAPSHOT_FILES[0]))).toBe(false);
  });
  it("rejects a generated data junction to the source without deleting user files", () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    link(path.join(f.cwd, ".data"), path.join(f.standalone, ".data"));
    expect(() => copyPublicSnapshots({ ...f })).toThrow(/link|canonical/i);
    expect(fs.readdirSync(path.join(f.cwd, ".data"))).toHaveLength(9);
  });
  it("rejects a linked source directory and an out-of-project standalone", () => {
    const f = create(), other = create();
    fs.rmdirSync(path.join(f.cwd, ".data"));
    link(path.join(other.cwd, ".data"), path.join(f.cwd, ".data"));
    expect(() => copyPublicSnapshots(f)).toThrow(/link|canonical/i);
    expect(() => copyPublicSnapshots({ cwd: f.cwd, standaloneServer: other.standaloneServer })).toThrow(/outside|standalone/i);
  });
  it.runIf(process.platform !== "win32")("rejects a linked official source file", () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    const name = PUBLIC_SNAPSHOT_FILES[0], source = path.join(f.cwd, ".data", name);
    fs.unlinkSync(source);
    const external = path.join(f.cwd, "test-only-canary.txt");
    fs.writeFileSync(external, "TEST_ONLY_PRIVATE");
    fs.symlinkSync(external, source);
    expect(() => copyPublicSnapshots(f)).toThrow(/link|regular/i);
    expect(fs.readFileSync(external, "utf8")).toBe("TEST_ONLY_PRIVATE");
  });
  it("requires all nine files for an artifact, and rejects extra data entries without reading them", () => {
    const f = create();
    expect(() => copyPublicSnapshots({ ...f, required: true })).toThrow(/missing/i);
    seed(path.join(f.cwd, ".data"), "A");
    copyPublicSnapshots(f);
    fs.mkdirSync(path.join(f.standalone, ".data", "private-directory"));
    expect(() => assertPublicSnapshotDirectory(path.join(f.standalone, ".data"), { required: true })).toThrow(/unexpected/i);
  });
  it("copies only sanitized source sync state for the existing failure reader, never public packages", () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    const name = "finlife_deposit_sync_attempt.json";
    fs.writeFileSync(path.join(f.cwd, ".data", name), JSON.stringify({ status: "failed", phase: "snapshot", startedAt: "2026-10-18T00:00:00.000Z", updatedAt: "2026-10-18T00:00:01.000Z", errorCode: "SNAPSHOT_WRITE_FAILED", secret: "TEST_ONLY_NEVER_COPY" }));
    prepareSourceSnapshotAssets(f);
    const state = JSON.parse(fs.readFileSync(path.join(f.standalone, ".data", name), "utf8"));
    expect(state.status).toBe("failed");
    expect(state.secret).toBeUndefined();
    expect(() => assertPublicSnapshotDirectory(path.join(f.standalone, ".data"), { required: true })).toThrow(/unexpected/i);
    fs.unlinkSync(path.join(f.cwd, ".data", name));
    // The later successful official CLI sync wrote a newer root snapshot and removed its own marker.
    writeRootSnapshot(f.cwd, "deposit", "2026-10-18T00:00:02.000Z");
    prepareSourceSnapshotAssets(f);
    expect(fs.existsSync(path.join(f.standalone, ".data", name))).toBe(false);
  });
  it("fails closed on malformed sync state instead of presenting an old snapshot as fresh", () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    fs.writeFileSync(path.join(f.cwd, ".data", "finlife_deposit_sync_attempt.json"), "{}");
    expect(() => prepareSourceSnapshotAssets(f)).toThrow(/sync state/i);
  });
  it("uses a validated managed installation's package B instead of preserved root A", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A"); seed(path.join(f.standalone, ".data"), "B");
    const write = (p: string, data: string) => { fs.mkdirSync(path.dirname(path.join(f.cwd, p)), { recursive: true }); fs.writeFileSync(path.join(f.cwd, p), data); };
    write("package.json", JSON.stringify({ version: "1.0.0" }));
    write("pnpm-lock.yaml", "test-only-lock\n"); write(".env.local.example", "# test only\n");
    write("scripts/planning_desktop_install_state.mjs", ""); write("scripts/planning_v2_desktop_uninstall.mjs", "");
    write("desktop-manifest.json", JSON.stringify({ kind: "planning-v2-desktop", provenanceVersion: DESKTOP_PROVENANCE_VERSION, version: "1.0.0", packageVersion: "1.0.0", gitSha: "1".repeat(40), platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules, lockfileSha256: crypto.createHash("sha256").update("test-only-lock\n").digest("hex"), artifactChecksum: { algorithm: "sha256", value: "1".repeat(64), fileCount: 1, totalBytes: 1, excludes: ["desktop-manifest.json"] } }));
    const result = await preparePublicSnapshotRuntime(f);
    expect(result.managed).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(f.standalone, ".data", PUBLIC_SNAPSHOT_FILES[0]), "utf8")).value).toBe("B");
    write("desktop-manifest.json", "{}");
    await expect(preparePublicSnapshotRuntime(f)).rejects.toThrow(/identity|managed|installation/i);
  });

  it("source restart keeps runtime-written scenario/tmp entries untouched and starts", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    await preparePublicSnapshotRuntime(f);
    const data = path.join(f.standalone, ".data");
    const entries = writeRuntimeEntries(data);
    seed(path.join(f.cwd, ".data"), "B");
    const result = await preparePublicSnapshotRuntime(f);
    expect(result.managed).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(data, PUBLIC_SNAPSHOT_FILES[0]), "utf8")).value).toBe("B");
    expect(readAll(data, entries)).toEqual(entries);
  });

  it("managed start keeps a runtime attempt marker and runtime entries, still using package files", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A"); seed(path.join(f.standalone, ".data"), "B");
    makeManaged(f.cwd);
    const data = path.join(f.standalone, ".data");
    const marker = JSON.stringify({ status: "failed", phase: "db", startedAt: "2026-10-18T00:00:00.000Z", updatedAt: "2026-10-18T00:00:01.000Z", errorCode: "DB_SYNC_FAILED" });
    fs.writeFileSync(path.join(data, "finlife_saving_sync_attempt.json"), marker);
    const entries = writeRuntimeEntries(data);
    const result = await preparePublicSnapshotRuntime(f);
    expect(result.managed).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(data, PUBLIC_SNAPSHOT_FILES[0]), "utf8")).value).toBe("B");
    expect(fs.readFileSync(path.join(data, "finlife_saving_sync_attempt.json"), "utf8")).toBe(marker);
    expect(readAll(data, entries)).toEqual(entries);
  });

  it.runIf(process.platform !== "win32")("managed start rejects a linked known file and a missing official file", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A"); seed(path.join(f.standalone, ".data"), "B");
    makeManaged(f.cwd);
    const data = path.join(f.standalone, ".data");
    const external = path.join(f.cwd, "test-only-sentinel.txt");
    fs.writeFileSync(external, "TEST_ONLY_SENTINEL");
    fs.symlinkSync(external, path.join(data, "finlife_deposit_sync_attempt.json"));
    await expect(preparePublicSnapshotRuntime(f)).rejects.toThrow(/link|regular/i);
    fs.unlinkSync(path.join(data, "finlife_deposit_sync_attempt.json"));
    fs.unlinkSync(path.join(data, PUBLIC_SNAPSHOT_FILES[1]));
    fs.symlinkSync(external, path.join(data, PUBLIC_SNAPSHOT_FILES[1]));
    await expect(preparePublicSnapshotRuntime(f)).rejects.toThrow(/link|regular/i);
    fs.unlinkSync(path.join(data, PUBLIC_SNAPSHOT_FILES[1]));
    await expect(preparePublicSnapshotRuntime(f)).rejects.toThrow(/missing/i);
    expect(fs.readFileSync(external, "utf8")).toBe("TEST_ONLY_SENTINEL");
  });

  it.runIf(process.platform !== "win32")("source start rejects a hardlinked known generated file", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    await preparePublicSnapshotRuntime(f);
    const data = path.join(f.standalone, ".data");
    const external = path.join(f.cwd, "test-only-hardlink-sentinel.txt");
    fs.writeFileSync(external, "TEST_ONLY_SENTINEL");
    fs.linkSync(external, path.join(data, "finlife_credit-loan_sync_attempt.json"));
    await expect(preparePublicSnapshotRuntime(f)).rejects.toThrow(/link|regular/i);
    expect(fs.readFileSync(external, "utf8")).toBe("TEST_ONLY_SENTINEL");
  });

  // Runtime-written FINLIFE attempt markers when the root has no marker (decision of meeting 116).
  it("T1 keeps a runtime fetch failure across a source restart and the status reader stays not fresh", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    writeRootSnapshot(f.cwd, "deposit", new Date(Date.now() - 60_000).toISOString());
    await preparePublicSnapshotRuntime(f);
    const marker = path.join(f.standalone, ".data", "finlife_deposit_sync_attempt.json");
    const text = attemptText("failed", "fetch", new Date().toISOString(), "SYNC_FAILED");
    fs.writeFileSync(marker, text);
    await preparePublicSnapshotRuntime(f);
    expect(fs.readFileSync(marker, "utf8")).toBe(text);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(f.standalone);
    try {
      expect(loadFinlifeSyncAttempt("deposit")?.status).toBe("failed");
      const status = (await getUnifiedSourceStatuses()).find(row => row.sourceId === "finlife" && row.kind === "deposit");
      expect(status?.isFresh).toBe(false);
      expect(status?.lastError?.message).toContain("동기화가 완료되지 않았습니다");
    } finally { cwd.mockRestore(); }
  });

  it("T2/T3 keeps runtime db/snapshot/completion failures and a running marker", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    const cases = [["saving", "failed", "db", "DB_SYNC_FAILED"], ["mortgage-loan", "failed", "snapshot", "SNAPSHOT_WRITE_FAILED"], ["rent-house-loan", "failed", "completion", "COMPLETION_WRITE_FAILED"], ["credit-loan", "running", "db", undefined]] as const;
    for (const [kind] of cases) writeRootSnapshot(f.cwd, kind, "2026-10-18T00:00:00.000Z");
    await preparePublicSnapshotRuntime(f);
    const written: Record<string, string> = {};
    for (const [kind, status, phase, code] of cases) {
      written[kind] = attemptText(status, phase, "2026-10-18T00:10:00.000Z", code);
      fs.writeFileSync(path.join(f.standalone, ".data", `finlife_${kind}_sync_attempt.json`), written[kind]);
    }
    await preparePublicSnapshotRuntime(f);
    for (const [kind] of cases) expect(fs.readFileSync(path.join(f.standalone, ".data", `finlife_${kind}_sync_attempt.json`), "utf8")).toBe(written[kind]);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(f.standalone);
    try { expect(loadFinlifeSyncAttempt("saving")?.phase).toBe("db"); } finally { cwd.mockRestore(); }
  });

  it("T4 removes a runtime marker only after a strictly newer official root snapshot without a root marker", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    writeRootSnapshot(f.cwd, "deposit", "2026-10-18T00:00:00.000Z");
    await preparePublicSnapshotRuntime(f);
    const marker = path.join(f.standalone, ".data", "finlife_deposit_sync_attempt.json");
    fs.writeFileSync(marker, attemptText("failed", "fetch", "2026-10-18T00:10:00.000Z", "SYNC_FAILED"));
    writeRootSnapshot(f.cwd, "deposit", "2026-10-18T01:00:00.000Z");
    await preparePublicSnapshotRuntime(f);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it("T7/T9 never removes an invalid marker, or a valid one without strictly newer proof", async () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    await preparePublicSnapshotRuntime(f);
    const data = path.join(f.standalone, ".data");
    const cases: Array<[string, unknown, string]> = [
      ["deposit", "2026-10-18T00:10:00.000Z", attemptText("failed", "fetch", "2026-10-18T00:10:00.000Z")], // equal time
      ["saving", "not-a-date", attemptText("failed", "fetch", "2026-10-18T00:10:00.000Z")], // invalid snapshot time
      ["mortgage-loan", undefined, attemptText("failed", "fetch", "2026-10-18T00:10:00.000Z")], // root snapshot missing
      ["rent-house-loan", "2026-10-18T01:00:00.000Z", attemptText("failed", "fetch", "not-a-date")], // invalid marker time
      ["credit-loan", "2026-10-18T01:00:00.000Z", JSON.stringify({ status: "unknown", testOnly: true })], // invalid marker
    ];
    for (const [kind, generatedAt, text] of cases) {
      if (generatedAt === undefined) fs.rmSync(path.join(f.cwd, ".data", `finlife_${kind}_snapshot.json`), { force: true });
      else writeRootSnapshot(f.cwd, kind, generatedAt);
      fs.writeFileSync(path.join(data, `finlife_${kind}_sync_attempt.json`), text);
    }
    await preparePublicSnapshotRuntime(f);
    for (const [kind, , text] of cases) expect(fs.readFileSync(path.join(data, `finlife_${kind}_sync_attempt.json`), "utf8")).toBe(text);
  });

  it("artifact checks stay strict: runtime entries and attempt markers are rejected there", () => {
    const f = create(); seed(path.join(f.cwd, ".data"), "A");
    copyPublicSnapshots({ ...f, required: true });
    const data = path.join(f.standalone, ".data");
    expect(assertPublicSnapshotDirectory(data, { required: true }).count).toBe(9);
    writeRuntimeEntries(data);
    expect(() => assertPublicSnapshotDirectory(data, { required: true })).toThrow(/unexpected/i);
    expect(assertManagedSnapshotEntries(data, { required: true }).count).toBe(9);
  });
});
