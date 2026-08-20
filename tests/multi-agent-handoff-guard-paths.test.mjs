import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

const guardScript = path.resolve("scripts/multi_agent_handoff_guard.mjs");

function createRepository(configText) {
  const repo = mkdtempSync(path.join(os.tmpdir(), "multi-agent-guard-"));
  mkdirSync(path.join(repo, ".codex/skills/known"), { recursive: true });
  writeFileSync(path.join(repo, ".codex/config.toml"), configText);
  writeFileSync(path.join(repo, ".codex/skills/known/SKILL.md"), "---\nname: known\ndescription: test\n---\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", ".codex/config.toml", ".codex/skills/known/SKILL.md"], { cwd: repo });
  return repo;
}

function runGuard(repo) {
  return spawnSync(process.execPath, [guardScript, "--configured-skills-only"], {
    cwd: repo,
    encoding: "utf8",
  });
}

test("repository skill paths from another checkout resolve against the current checkout", () => {
  const repo = createRepository(`
[[skills.config]]
path = "/other/checkout/finance/.codex/skills/known/SKILL.md"
enabled = true
`);
  try {
    const result = runGuard(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS configured-skills/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("repository skill paths from another checkout fail when absent locally", () => {
  const repo = createRepository(`
[[skills.config]]
path = "/other/checkout/finance/.codex/skills/known/SKILL.md"
enabled = true

[[skills.config]]
path = "/other/checkout/finance/.codex/skills/missing/SKILL.md"
enabled = true

[[skills.config]]
path = "/external/user/.codex/skills/personal/SKILL.md"
enabled = true
`);
  try {
    const result = runGuard(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /configured repository skill is missing from current checkout: \.codex\/skills\/missing\/SKILL\.md/);
    assert.doesNotMatch(result.stderr, /personal/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
