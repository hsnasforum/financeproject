import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { PUBLIC_SNAPSHOT_FILES } from "../scripts/public_snapshot_assets.mjs";
import { auditBuildTraces, auditStandaloneTree } from "../scripts/standalone_privacy_gate.mjs";
import * as normalization from "../scripts/standalone_next_output.mjs";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function write(root: string, rel: string, value = "TEST_ONLY\n") {
  const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, value); return p;
}
function seed() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "finance-next-output-"))); roots.push(root);
  const out = path.join(root, ".next/standalone");
  write(out, "server.js"); write(out, ".next/BUILD_ID", "synthetic\n"); write(root, ".next/BUILD_ID", "synthetic\n");
  for (const n of PUBLIC_SNAPSHOT_FILES) { write(root, ".data/" + n, "{}"); write(out, ".data/" + n, "{}"); }
  return { root, out };
}
function trace(root: string, entries: string[]) {
  const p = path.join(root, ".next/server/app/api/test/route.js.nft.json"); fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ version: 1, files: entries.map(e => path.relative(path.dirname(p), path.join(root, e))) }));
  return p;
}
function dependency(root: string, out: string, name = "pkg") {
  const rel = "node_modules/.pnpm/" + name + "@1.0.0/node_modules/" + name;
  for (const r of [root, out]) { write(r, rel + "/package.json", JSON.stringify({ name, version: "1.0.0" })); write(r, rel + "/index.js", "module.exports='traced';"); }
  const link = path.join(out, "node_modules", name);
  fs.symlinkSync(path.join(root, rel), link, process.platform === "win32" ? "junction" : "dir");
  return { link, rel };
}
describe("Next standalone output normalization", () => {
  it("reproduces pinned Next Windows exclusion mismatch without claiming a Windows execution", () => {
    const require = createRequire(import.meta.url);
    const pm = require("next/dist/compiled/picomatch");
    const root = "D:\\a\\finance\\finance", file = path.win32.join(root, ".data", "benefits_snapshot.json");
    const glob = path.win32.join(root, "./.data/**/*");
    expect(pm(glob, { dot: true, contains: true, windows: true })(file)).toBe(false);
    expect(pm(glob.replaceAll("\\", "/"), { dot: true, contains: true })(file.replaceAll("\\", "/"))).toBe(true);
  });
  it("drops traced .data and only the fresh generated copy, keeping the source and framework assets", () => {
    const { root, out } = seed();
    const privateSource = write(root, ".data/journal/test.json", "TEST_ONLY_PRIVATE");
    write(out, ".data/journal/test.json", "TEST_ONLY_PRIVATE");
    write(root, ".data/gov24_sync_checkpoint.json", "{}"); write(out, ".data/gov24_sync_checkpoint.json", "{}");
    write(root, "node_modules/next/dist/lib/framework/file.js"); write(out, "node_modules/next/dist/lib/framework/file.js");
    const p = trace(root, [".data/journal/test.json", ".data/gov24_sync_checkpoint.json", ".data/" + PUBLIC_SNAPSHOT_FILES[0], "node_modules/next/dist/lib/framework/file.js"]);
    expect(auditBuildTraces({ projectRoot: root }).ok).toBe(false);
    const result = normalization.normalizeNextStandaloneOutput({ projectRoot: root });
    expect(result.dataTraceEntriesRemoved).toBe(3);
    expect(JSON.parse(fs.readFileSync(p, "utf8")).files).toHaveLength(1);
    expect(auditBuildTraces({ projectRoot: root }).ok).toBe(true);
    expect(fs.existsSync(path.join(out, ".data"))).toBe(false);
    expect(fs.readFileSync(privateSource, "utf8")).toBe("TEST_ONLY_PRIVATE");
    expect(fs.existsSync(path.join(out, "node_modules/next/dist/lib/framework/file.js"))).toBe(true);
  });
  it("relocates absolute dependency links only to the matching already traced package", () => {
    const { root, out } = seed(), d = dependency(root, out);
    trace(root, [d.rel + "/index.js", d.rel + "/package.json"]);
    expect(auditStandaloneTree({ standaloneDir: out, phase: "build" }).ok).toBe(false);
    expect(normalization.normalizeNextStandaloneOutput({ projectRoot: root }).dependencyLinksRelocated).toBe(1);
    expect(fs.realpathSync(d.link)).toBe(fs.realpathSync(path.join(out, d.rel)));
    expect(createRequire(import.meta.url)(d.link)).toBe("traced");
    expect(fs.readFileSync(path.join(root, d.rel, "index.js"), "utf8")).toContain("traced");
  });
  it.each(["absent", "different"])("rejects a dependency whose traced counterpart is %s", mode => {
    const { root, out } = seed(), d = dependency(root, out);
    if (mode === "absent") fs.rmSync(path.join(out, d.rel), { recursive: true });
    else write(out, d.rel + "/package.json", JSON.stringify({ name: "other", version: "1.0.0" }));
    expect(() => normalization.normalizeNextStandaloneOutput({ projectRoot: root })).toThrow(/dependency/);
    expect(fs.realpathSync(d.link)).toBe(fs.realpathSync(path.join(root, d.rel)));
  });
  it("does not allow external package links outside project dependencies", () => {
    const { root, out } = seed();
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "finance-outside-package-"))); roots.push(outside);
    write(outside, "package.json", JSON.stringify({ name: "pkg", version: "1" }));
    fs.mkdirSync(path.join(out, "node_modules"), { recursive: true });
    fs.symlinkSync(outside, path.join(out, "node_modules/pkg"), process.platform === "win32" ? "junction" : "dir");
    expect(() => normalization.normalizeNextStandaloneOutput({ projectRoot: root })).toThrow(/dependency/);
    expect(fs.existsSync(path.join(outside, "package.json"))).toBe(true);
  });
  it("keeps non-data private traces and output as a blocking privacy failure", () => {
    const { root, out } = seed();
    write(root, "tmp/private.sqlite"); write(out, "tmp/private.sqlite");
    trace(root, ["tmp/private.sqlite"]);
    normalization.normalizeNextStandaloneOutput({ projectRoot: root });
    expect(auditBuildTraces({ projectRoot: root }).ok).toBe(false);
    expect(auditStandaloneTree({ standaloneDir: out, phase: "build" }).ok).toBe(false);
    expect(fs.existsSync(path.join(out, "tmp/private.sqlite"))).toBe(true);
  });
  it("supports read-only pnpm source package metadata hardlinks without linking the generated copy", () => {
    const { root, out } = seed(), d = dependency(root, out);
    const manifest = path.join(root, d.rel, "package.json");
    fs.linkSync(manifest, path.join(root, "store-metadata.json"));
    expect(fs.statSync(manifest).nlink).toBe(2);
    normalization.normalizeNextStandaloneOutput({ projectRoot: root });
    expect(fs.realpathSync(d.link)).toBe(fs.realpathSync(path.join(out, d.rel)));
    expect(fs.statSync(path.join(out, d.rel, "package.json")).nlink).toBe(1);
    expect(fs.statSync(manifest).nlink).toBe(2);
  });
  it("never normalizes an admitted runtime build", () => {
    const { root, out } = seed();
    write(root, ".next/standalone-privacy-receipt.json", "{}");
    const marker = write(out, ".data/runtime.tmp", "TEST_ONLY_RUNTIME");
    expect(() => normalization.normalizeNextStandaloneOutput({ projectRoot: root })).toThrow(/previously admitted/);
    expect(fs.readFileSync(marker, "utf8")).toBe("TEST_ONLY_RUNTIME");
  });
  it("rejects a hardlinked generated data file and leaves both links unchanged", () => {
    const { root, out } = seed();
    const source = path.join(root, ".data", PUBLIC_SNAPSHOT_FILES[0]), generated = path.join(out, ".data", PUBLIC_SNAPSHOT_FILES[0]);
    fs.unlinkSync(generated); fs.linkSync(source, generated);
    expect(() => normalization.normalizeNextStandaloneOutput({ projectRoot: root })).toThrow(/data/);
    expect(fs.statSync(source).nlink).toBe(2);
  });
  it("rejects a generated .data link without following or removing the source", () => {
    const { root, out } = seed();
    fs.rmSync(path.join(out, ".data"), { recursive: true });
    fs.symlinkSync(path.join(root, ".data"), path.join(out, ".data"), process.platform === "win32" ? "junction" : "dir");
    expect(() => normalization.normalizeNextStandaloneOutput({ projectRoot: root })).toThrow(/data/);
    expect(fs.lstatSync(path.join(out, ".data")).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(root, ".data", PUBLIC_SNAPSHOT_FILES[0]))).toBe(true);
  });
});
