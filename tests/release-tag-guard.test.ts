import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyReleaseTagContext } from "../scripts/release_tag_guard.mjs";

const roots: string[] = [];

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-release-tag-"));
  roots.push(root);
  git(root, ["init", "--quiet", "--initial-branch=main"]);
  write(root, "package.json", `${JSON.stringify({ name: "fixture", version: "1.0.4" })}\n`);
  write(root, ".gitignore", "*.log\nnode_modules/\n");
  write(root, "src/tracked.ts", "export {};\n");
  write(root, "scripts/tracked.mjs", "export {};\n");
  write(root, "public/tracked.txt", "tracked\n");
  write(root, "prisma/schema.prisma", "generator client {}\n");
  git(root, ["add", "."]);
  git(root, [
    "-c",
    "user.name=finance-test",
    "-c",
    "user.email=finance-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  const mainSha = git(root, ["rev-parse", "HEAD"]);
  git(root, ["tag", "v1.0.4"]);
  git(root, ["update-ref", "refs/remotes/origin/main", mainSha]);
  git(root, ["remote", "add", "origin", root]);
  return { root, mainSha };
}

afterEach(() => {
  for (const root of roots.splice(0, roots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("release tag guard", () => {
  it("accepts an exact package tag on the allowed main ancestry and remote tag", () => {
    const fixture = makeFixture();

    expect(verifyReleaseTagContext({
      cwd: fixture.root,
      sourceSha: fixture.mainSha,
      tag: "v1.0.4",
      defaultBranch: "main",
      verifyRemoteTag: true,
    })).toMatchObject({
      ok: true,
      sourceSha: fixture.mainSha,
      tag: "v1.0.4",
      packageVersion: "1.0.4",
    });
  });

  it("rejects a tag commit outside the allowed main ancestry", () => {
    const fixture = makeFixture();
    git(fixture.root, ["switch", "--quiet", "-c", "side"]);
    write(fixture.root, "side.txt", "side\n");
    git(fixture.root, ["add", "side.txt"]);
    git(fixture.root, [
      "-c",
      "user.name=finance-test",
      "-c",
      "user.email=finance-test@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "side",
    ]);
    const sideSha = git(fixture.root, ["rev-parse", "HEAD"]);
    git(fixture.root, ["tag", "--force", "v1.0.4", sideSha]);

    expect(() => verifyReleaseTagContext({
      cwd: fixture.root,
      sourceSha: sideSha,
      tag: "v1.0.4",
      defaultBranch: "main",
      verifyRemoteTag: true,
    })).toThrowError(/outside origin\/main/);
  });

  it("rejects a remote tag that moved away from the verified event SHA", () => {
    const fixture = makeFixture();
    git(fixture.root, ["switch", "--quiet", "-c", "side"]);
    write(fixture.root, "side.txt", "side\n");
    git(fixture.root, ["add", "side.txt"]);
    git(fixture.root, [
      "-c",
      "user.name=finance-test",
      "-c",
      "user.email=finance-test@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "side",
    ]);
    const sideSha = git(fixture.root, ["rev-parse", "HEAD"]);
    git(fixture.root, ["switch", "--quiet", "main"]);
    const remoteParent = fs.mkdtempSync(path.join(os.tmpdir(), "finance-release-remote-"));
    roots.push(remoteParent);
    const remotePath = path.join(remoteParent, "remote.git");
    git(fixture.root, ["clone", "--quiet", "--bare", fixture.root, remotePath]);
    git(remotePath, ["update-ref", "refs/tags/v1.0.4", sideSha]);
    git(fixture.root, ["remote", "set-url", "origin", remotePath]);

    expect(() => verifyReleaseTagContext({
      cwd: fixture.root,
      sourceSha: fixture.mainSha,
      tag: "v1.0.4",
      defaultBranch: "main",
      verifyRemoteTag: true,
    })).toThrowError(/remote tag target mismatch/);
  });

  it("rejects tag/version mismatch before release gates", () => {
    const fixture = makeFixture();

    expect(() => verifyReleaseTagContext({
      cwd: fixture.root,
      sourceSha: fixture.mainSha,
      tag: "v1.0.5",
      defaultBranch: "main",
    })).toThrowError(/tag\/version mismatch/);
  });

  it("rejects tracked and untracked worktree changes", () => {
    const tracked = makeFixture();
    const untracked = makeFixture();
    fs.appendFileSync(path.join(tracked.root, "src/tracked.ts"), "// dirty\n", "utf-8");
    write(untracked.root, "src/untracked.ts", "export {};\n");

    for (const fixture of [tracked, untracked]) {
      expect(() => verifyReleaseTagContext({
        cwd: fixture.root,
        sourceSha: fixture.mainSha,
        tag: "v1.0.4",
        defaultBranch: "main",
      })).toThrowError(/worktree contains tracked or unignored changes/);
    }
  });

  it("rejects ignored untracked files under copied source roots", () => {
    const fixture = makeFixture();
    write(fixture.root, "src/rogue.log", "not in tag\n");
    expect(git(fixture.root, ["status", "--porcelain=v1", "--untracked-files=all"])).toBe("");

    expect(() => verifyReleaseTagContext({
      cwd: fixture.root,
      sourceSha: fixture.mainSha,
      tag: "v1.0.4",
      defaultBranch: "main",
    })).toThrowError(/copied source roots contain ignored untracked files/);
  });
});
