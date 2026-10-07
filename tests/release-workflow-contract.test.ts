import fs from "node:fs";
import { describe, expect, it } from "vitest";

const APPROVED_ACTION_USES = new Set([
  "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
  "pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86",
  "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
  "actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f",
  "actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131",
  "softprops/action-gh-release@718ea10b132b3b2eba29c1007bb80653f286566b",
]);

function readWorkflow(): string {
  return fs.readFileSync(".github/workflows/release.yml", "utf-8");
}

function section(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const tail = source.slice(start);
  if (!endMarker) return tail;
  const end = tail.indexOf(endMarker, startMarker.length);
  return end < 0 ? tail : tail.slice(0, end);
}

describe("tag release workflow contract", () => {
  it("requires main ancestry, clean source, release:verify, and desktop build before upload", () => {
    const workflow = readWorkflow();
    const verifyJob = section(workflow, "  verify_and_package:\n", "\n  publish:\n");
    const requiredGate = verifyJob.indexOf("run: pnpm release:verify");
    const desktopBuild = verifyJob.indexOf("run: pnpm planning:v2:desktop:build");
    const desktopInstall = verifyJob.indexOf("cmd.exe /d /c install.cmd");
    const prodSmoke = verifyJob.indexOf("planning:v2:prod:smoke");
    const desktopSmoke = verifyJob.indexOf("planning:v2:desktop:smoke");
    const desktopUninstall = verifyJob.indexOf("cmd.exe /d /c uninstall.cmd");
    const provenance = verifyJob.indexOf("--mode=create");
    const upload = verifyJob.indexOf("actions/upload-artifact@");

    expect(workflow).toContain('- "v*.*.*"');
    expect(workflow).toContain("permissions: {}\n");
    expect(verifyJob).toContain("permissions:\n      contents: read");
    expect(verifyJob).toContain("runs-on: windows-latest");
    expect(verifyJob).toContain("timeout-minutes: 75");
    expect(verifyJob).toContain("shell: bash");
    expect(verifyJob).toContain("fetch-depth: 0");
    expect(verifyJob).toContain("fetch-tags: true");
    expect(verifyJob).toContain("persist-credentials: true");
    expect(verifyJob).toContain("--verify-remote-tag=true");
    expect(verifyJob.match(/release_tag_guard\.mjs/g)).toHaveLength(3);
    expect(requiredGate).toBeGreaterThan(0);
    expect(desktopBuild).toBeGreaterThan(requiredGate);
    expect(desktopInstall).toBeGreaterThan(desktopBuild);
    expect(prodSmoke).toBeGreaterThan(desktopInstall);
    expect(desktopSmoke).toBeGreaterThan(prodSmoke);
    expect(desktopUninstall).toBeGreaterThan(desktopSmoke);
    expect(verifyJob).toContain("PLANNING_DESKTOP_INSTALL_DIR");
    expect(verifyJob).toContain("PLANNING_DESKTOP_SKIP_SHORTCUTS");
    expect(verifyJob).not.toContain("PLANNING_DESKTOP_SKIP_INSTALL");
    expect(verifyJob).toContain("--use-installed-database");
    expect(verifyJob).toContain("desktop uninstall left package binaries behind");
    expect(verifyJob).toContain("desktop uninstall removed the SQLite database");
    expect(provenance).toBeGreaterThan(desktopUninstall);
    expect(upload).toBeGreaterThan(provenance);
    expect(verifyJob).not.toContain("rsync");
    expect(verifyJob).not.toContain("dereference");
    expect(verifyJob).not.toContain("tar -czf");
    expect(verifyJob).not.toContain("apt-get");
  });

  it("publishes only the downloaded verified bundle with minimal write permission", () => {
    const workflow = readWorkflow();
    const publishJob = section(workflow, "  publish:\n");
    const remoteGuard = publishJob.indexOf("--verify-remote-tag=true");
    const existingGuard = publishJob.indexOf("release_existing_release_guard.mjs");
    const download = publishJob.indexOf("actions/download-artifact@");
    const verify = publishJob.indexOf("--mode=verify");
    const release = publishJob.indexOf("softprops/action-gh-release@");

    expect(publishJob).toContain("needs: verify_and_package");
    expect(publishJob).toContain("permissions:\n      contents: write");
    expect(publishJob).toContain("persist-credentials: true");
    expect(remoteGuard).toBeGreaterThan(0);
    expect(existingGuard).toBeGreaterThan(remoteGuard);
    expect(download).toBeGreaterThan(existingGuard);
    expect(verify).toBeGreaterThan(download);
    expect(release).toBeGreaterThan(verify);
    expect(publishJob).toContain("overwrite_files: false");
    expect(publishJob).toContain("fail_on_unmatched_files: true");
    expect(publishJob).not.toContain("pnpm install");
    expect(publishJob).not.toContain("planning:v2:desktop:build");
    expect(publishJob).not.toContain("release:verify");
  });

  it("pins every action and keeps upload, download, and release assets exact", () => {
    const workflow = readWorkflow();
    const usesLines = workflow.split(/\r?\n/).filter((line) => line.trim().startsWith("uses:"));
    expect(usesLines.length).toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line).toMatch(/@[0-9a-f]{40}(?:\s+#\s+v\d+)?$/);
      const use = line.trim().replace(/^uses:\s*/, "").replace(/\s+#.*$/, "");
      expect(APPROVED_ACTION_USES.has(use), `unapproved action pin: ${use}`).toBe(true);
    }

    expect(workflow.split("planning-v2-desktop-${{ github.ref_name }}.tar.gz")).toHaveLength(3);
    expect(workflow.split("planning-v2-desktop-${{ github.ref_name }}.inventory.json")).toHaveLength(3);
    expect(workflow.split("planning-v2-desktop-${{ github.ref_name }}.manifest.json")).toHaveLength(3);
    expect(workflow).toContain("name: planning-v2-desktop-release-${{ github.run_id }}");
    expect(workflow).not.toContain("if: always()");
    expect(workflow).not.toMatch(/run:[^\n]*\$\{\{\s*github\.(?:ref_name|event\.repository\.default_branch)/);
  });
});
