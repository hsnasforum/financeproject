import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildBulkAdvisoryPayload,
  collectBulkAdvisories,
  runDependencyAudit,
} from "../scripts/deps_audit.mjs";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("dependency bulk advisory audit", () => {
  it("builds a deduplicated payload from pnpm lockfile package keys", () => {
    const payload = buildBulkAdvisoryPayload(`
lockfileVersion: '9.0'
packages:
  '@scope/pkg@2.0.0': {}
  'plain@1.0.0': {}
  'plain@1.0.0(peer@3.0.0)': {}
`);

    expect(payload).toEqual({
      "@scope/pkg": ["2.0.0"],
      plain: ["1.0.0"],
    });
  });

  it("fails closed on unsupported lockfile versions and package keys", () => {
    expect(() => buildBulkAdvisoryPayload(`
lockfileVersion: '10.0'
packages:
  'plain@1.0.0': {}
`)).toThrow(/unsupported pnpm lockfileVersion/);

    expect(() => buildBulkAdvisoryPayload(`
lockfileVersion: '9.0'
packages:
  malformed: {}
`)).toThrow(/unsupported pnpm package key/);
  });

  it("normalizes and sorts advisories by severity", () => {
    expect(collectBulkAdvisories({
      beta: [{ severity: "low", title: "low issue", vulnerable_versions: "<2" }],
      alpha: [{ severity: "critical", title: "critical issue", vulnerable_versions: "1.x", url: "https://example.test/a" }],
    })).toEqual([
      {
        packageName: "alpha",
        severity: "critical",
        title: "critical issue",
        vulnerableVersions: "1.x",
        url: "https://example.test/a",
      },
      {
        packageName: "beta",
        severity: "low",
        title: "low issue",
        vulnerableVersions: "<2",
        url: "",
      },
    ]);
  });

  it("fails closed on malformed responses and reports a clean live-shaped response", async () => {
    expect(() => collectBulkAdvisories({ broken: {} })).toThrow(/must be an array/);

    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "finance-deps-audit-"));
    tempDirs.push(cwd);
    await fs.writeFile(path.join(cwd, "pnpm-lock.yaml"), `
lockfileVersion: '9.0'
packages:
  'plain@1.0.0': {}
`, "utf8");

    const requests: Array<{ url: string; body: string }> = [];
    const result = await runDependencyAudit({
      cwd,
      fetchImpl: async (url: URL | RequestInfo, init?: RequestInit) => {
        requests.push({ url: String(url), body: String(init?.body) });
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    expect(result).toEqual({ ok: true, packageCount: 1, versionCount: 1, advisories: [] });
    expect(requests).toEqual([{
      url: "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
      body: JSON.stringify({ plain: ["1.0.0"] }),
    }]);
  });

  it("fails closed on registry errors and invalid JSON", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "finance-deps-audit-errors-"));
    tempDirs.push(cwd);
    await fs.writeFile(path.join(cwd, "pnpm-lock.yaml"), `
lockfileVersion: '9.0'
packages:
  'plain@1.0.0': {}
`, "utf8");

    await expect(runDependencyAudit({
      cwd,
      fetchImpl: async () => new Response("retired", { status: 410 }),
    })).rejects.toThrow(/status=410/);

    await expect(runDependencyAudit({
      cwd,
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    })).rejects.toThrow(/not valid JSON/);
  });

  it("returns a failing result when the registry reports an advisory", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "finance-deps-audit-advisory-"));
    tempDirs.push(cwd);
    await fs.writeFile(path.join(cwd, "pnpm-lock.yaml"), `
lockfileVersion: '9.0'
packages:
  'plain@1.0.0': {}
`, "utf8");

    const result = await runDependencyAudit({
      cwd,
      fetchImpl: async () => new Response(JSON.stringify({
        plain: [{ severity: "high", title: "unsafe", vulnerable_versions: "1.x" }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    });

    expect(result.ok).toBe(false);
    expect(result.advisories).toHaveLength(1);
  });
});
