#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";

const cwd = process.cwd();
const packageJsonPath = path.join(cwd, "package.json");
const changelogPath = path.join(cwd, "CHANGELOG.md");
const BUMP_KINDS = ["patch", "minor", "major"];

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    out[key] = rest.length > 0 ? rest.join("=") : "true";
  }
  return out;
}

function runPnpm(args) {
  return new Promise((resolve) => {
    const child = spawn("pnpm", args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
    child.on("exit", (code) => resolve(typeof code === "number" ? code : 1));
  });
}

async function readPackageJson() {
  const raw = await fs.readFile(packageJsonPath, "utf8");
  return JSON.parse(raw);
}

async function writePackageJson(payload) {
  await fs.writeFile(packageJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function replaceVersionInScripts(scripts, nextVersion) {
  const out = {};
  for (const [name, cmd] of Object.entries(scripts ?? {})) {
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

function ensureChangelogStub(raw, version) {
  const heading = `## v${version} - ${todayIsoDate()}`;
  if (raw.includes(`## v${version} -`)) return raw;

  const headerLine = raw.startsWith("#") ? raw.split("\n")[0] : "# Changelog";
  const body = raw.startsWith("#")
    ? raw.split("\n").slice(1).join("\n").trimStart()
    : raw.trimStart();

  const section = [
    heading,
    "",
    "### Added",
    "- TBD",
    "",
    "### Changed",
    "- TBD",
    "",
    "### Fixed",
    "- TBD",
    "",
  ].join("\n");

  return `${headerLine}\n\n${section}${body}`.trimEnd() + "\n";
}

async function resolveBumpKind(args) {
  const fromArg = typeof args.bump === "string" ? args.bump.trim().toLowerCase() : "";
  if (BUMP_KINDS.includes(fromArg)) return fromArg;
  if (fromArg && !BUMP_KINDS.includes(fromArg)) {
    throw new Error(`--bump must be one of: ${BUMP_KINDS.join(", ")}`);
  }
  if (String(args.yes).toLowerCase() === "true" || !process.stdin.isTTY || !process.stdout.isTTY) {
    return "patch";
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("Select version bump (patch/minor/major) [patch]: ")).trim().toLowerCase();
    if (!answer) return "patch";
    if (!BUMP_KINDS.includes(answer)) {
      throw new Error(`invalid bump: ${answer}`);
    }
    return answer;
  } finally {
    rl.close();
  }
}

async function ensureChangelogExists() {
  try {
    await fs.access(changelogPath);
  } catch {
    await fs.writeFile(changelogPath, "# Changelog\n\n", "utf8");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    throw new Error("release:prepare does not accept --version. Use --bump=patch|minor|major");
  }

  console.log("[release:prepare] run release:verify");
  const verifyCode = await runPnpm(["release:verify"]);
  if (verifyCode !== 0) {
    throw new Error(`release:verify failed (exit=${verifyCode})`);
  }

  const currentPkg = await readPackageJson();
  const currentVersion = String(currentPkg.version ?? "").trim();
  if (!currentVersion) {
    throw new Error("package.json version is missing");
  }

  const bumpKind = await resolveBumpKind(args);
  console.log(`[release:prepare] bump=${bumpKind}`);

  const versionCode = await runPnpm(["version", bumpKind, "--no-git-tag-version"]);
  if (versionCode !== 0) {
    throw new Error(`pnpm version ${bumpKind} failed (exit=${versionCode})`);
  }

  const nextPkg = await readPackageJson();
  const nextVersion = String(nextPkg.version ?? "").trim();
  if (!nextVersion) {
    throw new Error("package.json version update failed");
  }

  nextPkg.scripts = replaceVersionInScripts(nextPkg.scripts, nextVersion);
  await writePackageJson(nextPkg);

  await ensureChangelogExists();
  const changelogRaw = await fs.readFile(changelogPath, "utf8");
  const nextChangelog = ensureChangelogStub(changelogRaw, nextVersion);
  await fs.writeFile(changelogPath, nextChangelog, "utf8");

  console.log(`[release:prepare] version ${currentVersion} -> ${nextVersion}`);
  console.log(`[release:prepare] updated ${path.relative(cwd, packageJsonPath)}`);
  console.log(`[release:prepare] updated ${path.relative(cwd, changelogPath)}`);
  console.log("[release:prepare] next:");
  console.log("  1) Fill CHANGELOG.md stub details");
  console.log("  2) Run: pnpm release:verify");
  console.log("  3) Tag: git tag vX.Y.Z && git push origin vX.Y.Z");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[release:prepare] FAIL\n${message}`);
  process.exit(1);
});
