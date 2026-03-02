#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const packageJsonPath = path.join(cwd, "package.json");
const changelogPath = path.join(cwd, "docs", "planning-v2-changelog.md");

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [k, ...rest] = arg.slice(2).split("=");
    out[k] = rest.join("=");
  }
  return out;
}

function bumpPatch(version) {
  const [major, minor, patch] = version.split(".").map((part) => Number(part));
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    throw new Error(`invalid semver: ${version}`);
  }
  return `${major}.${minor}.${patch + 1}`;
}

function replaceVersionInScripts(scripts, nextVersion) {
  const out = {};
  for (const [name, cmd] of Object.entries(scripts || {})) {
    if (typeof cmd !== "string") {
      out[name] = cmd;
      continue;
    }
    out[name] = cmd.replace(/--version=\d+\.\d+\.\d+/g, `--version=${nextVersion}`);
  }
  return out;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addChangelogSection(raw, version) {
  const marker = `(v${version})`;
  if (raw.includes(marker)) return raw;
  const lines = raw.split("\n");
  const title = lines[0] ?? "# Planning v2 Changelog";
  const body = lines.slice(1).join("\n").trimStart();
  const section = [
    `## ${todayIsoDate()} Release Prep (v${version})`,
    "",
    "- 릴리즈 준비: 버전 갱신 및 스크립트 버전 파라미터 동기화.",
    "- CI required gates 기준 고정: `pnpm test` + `pnpm planning:v2:complete` + `pnpm planning:v2:compat`.",
    "- 본 섹션의 세부 변경사항/릴리즈 요약은 배포 직전에 보강합니다.",
    "",
  ].join("\n");
  return `${title}\n\n${section}${body}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pkgRaw = await fs.readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(pkgRaw);
  const currentVersion = String(pkg.version ?? "").trim();
  if (!currentVersion) throw new Error("package.json version is missing");
  const nextVersion = args.version ? String(args.version).trim() : bumpPatch(currentVersion);
  if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
    throw new Error(`--version must be semver (x.y.z): ${nextVersion}`);
  }

  pkg.version = nextVersion;
  pkg.scripts = replaceVersionInScripts(pkg.scripts, nextVersion);
  await fs.writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  const changelogRaw = await fs.readFile(changelogPath, "utf8");
  const nextChangelog = addChangelogSection(changelogRaw, nextVersion);
  await fs.writeFile(changelogPath, nextChangelog.endsWith("\n") ? nextChangelog : `${nextChangelog}\n`, "utf8");

  console.log(`[release:prepare] version ${currentVersion} -> ${nextVersion}`);
  console.log(`[release:prepare] updated ${path.relative(cwd, packageJsonPath)}`);
  console.log(`[release:prepare] updated ${path.relative(cwd, changelogPath)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[release:prepare] FAIL\n${message}`);
  process.exit(1);
});

