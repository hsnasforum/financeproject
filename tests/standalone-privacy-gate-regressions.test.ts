import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditStandaloneTree, createTraceCopyFailureDetector } from "../scripts/standalone_privacy_gate.mjs";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
describe("standalone privacy regressions", () => {
  it.each(["stdout", "stderr"] as const)("detects a warning split on %s despite interleaved output", (stream) => {
    const detector = createTraceCopyFailureDetector();
    const other = stream === "stdout" ? "stderr" : "stdout";
    expect(detector.push(stream, Buffer.from("Failed to copy trac"))).toBe(false);
    expect(detector.push(other, Buffer.from("Building page\n"))).toBe(false);
    expect(detector.push(stream, Buffer.from("ed files for /synthetic/route.js\n"))).toBe(true);
    expect(detector.seen).toBe(true);
    expect(detector.push(other, Buffer.from("Done\n"))).toBe(true);
  });
  it("does not construct a warning from fragments on different streams", () => {
    const detector = createTraceCopyFailureDetector();
    detector.push("stdout", Buffer.from("Failed to copy trac"));
    expect(detector.push("stderr", Buffer.from("ed files\n"))).toBe(false);
    expect(detector.seen).toBe(false);
  });
  it.each(["build", "artifact-final"] as const)("rejects a completely missing .data in %s", (phase) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-privacy-missing-"));
    roots.push(root);
    fs.writeFileSync(path.join(root, "server.js"), "// TEST_ONLY\n");
    const result = auditStandaloneTree({ standaloneDir: root, phase });
    expect(result.ok).toBe(false);
    expect(result.violationsByCode).toMatchObject({ "standalone-data-missing": 1 });
  });
  it("keeps source-input .data optional", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-privacy-input-"));
    roots.push(root);
    expect(auditStandaloneTree({ standaloneDir: root, phase: "source-input" }).ok).toBe(true);
  });
});
