import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

const securityScript = path.resolve("scripts/security_check.mjs");

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

test("security history readiness fails closed in a shallow checkout", () => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "security-history-"));
  const source = path.join(fixtureRoot, "source");
  const shallow = path.join(fixtureRoot, "shallow");
  try {
    git(["init", "-q", source], fixtureRoot);
    git(["config", "user.email", "security-test@example.com"], source);
    git(["config", "user.name", "Security Test"], source);
    writeFileSync(path.join(source, "fixture.txt"), "first\n");
    git(["add", "fixture.txt"], source);
    git(["commit", "-qm", "first"], source);
    writeFileSync(path.join(source, "fixture.txt"), "second\n");
    git(["commit", "-qam", "second"], source);
    git(["clone", "-q", "--depth", "1", `file://${source}`, shallow], fixtureRoot);

    assert.equal(git(["rev-parse", "--is-shallow-repository"], shallow).trim(), "true");
    const result = spawnSync(process.execPath, [securityScript, "--history-readiness-only"], {
      cwd: shallow,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires a full clone/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("security history readiness accepts a full checkout", () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "security-history-full-"));
  try {
    git(["init", "-q"], repo);

    const result = spawnSync(process.execPath, [securityScript, "--history-readiness-only"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS repository-history-readiness/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("private-key history scan detects a marker removed from the current tree", () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "security-history-leak-"));
  try {
    git(["init", "-q"], repo);
    git(["config", "user.email", "security-test@example.com"], repo);
    git(["config", "user.name", "Security Test"], repo);
    writeFileSync(path.join(repo, "leaked.pem"), `-----BEGIN ${"PRIVATE KEY"}-----\nfixture\n`);
    git(["add", "leaked.pem"], repo);
    git(["commit", "-qm", "add leaked fixture"], repo);
    rmSync(path.join(repo, "leaked.pem"));
    git(["commit", "-qam", "remove leaked fixture"], repo);

    const result = spawnSync(process.execPath, [securityScript, "--private-key-history-only"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAIL repo-history-no-private-key/);
    assert.match(result.stderr, /add leaked fixture|remove leaked fixture/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
