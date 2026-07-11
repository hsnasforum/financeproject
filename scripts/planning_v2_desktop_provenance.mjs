import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const DESKTOP_MANIFEST_FILENAME = "desktop-manifest.json";
export const DESKTOP_MANIFEST_KIND = "planning-v2-desktop";
export const DESKTOP_PROVENANCE_VERSION = 1;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

async function readJsonFile(filePath, label) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "ENOENT") {
      throw new Error(`${label} not found: ${filePath}`);
    }
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${filePath} (${message})`);
  }
}

export async function readPackageVersion(cwd) {
  const packageJson = await readJsonFile(path.join(cwd, "package.json"), "package.json");
  return asString(packageJson.version) || "unknown";
}

export function currentGitSha(cwd) {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : "";
  } catch {
    return "";
  }
}

export async function fileSha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

export async function lockfileSha256(cwd) {
  return fileSha256(path.join(cwd, "pnpm-lock.yaml"));
}

async function walkArtifactFiles(rootDir, currentDir, files) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
    if (entry.isSymbolicLink()) {
      throw new Error(`desktop artifact contains unsupported symlink: ${relativePath}`);
    }
    if (relativePath === DESKTOP_MANIFEST_FILENAME) continue;
    if (entry.isDirectory()) {
      await walkArtifactFiles(rootDir, absolutePath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

export async function listArtifactFiles(artifactDir) {
  const files = [];
  await walkArtifactFiles(artifactDir, artifactDir, files);
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

export async function computeArtifactChecksum(artifactDir) {
  const files = await listArtifactFiles(artifactDir);
  const aggregate = crypto.createHash("sha256");
  let totalBytes = 0;

  for (const relativePath of files) {
    const absolutePath = path.join(artifactDir, ...relativePath.split("/"));
    const [stats, digest] = await Promise.all([fs.stat(absolutePath), fileSha256(absolutePath)]);
    totalBytes += stats.size;
    aggregate.update(relativePath);
    aggregate.update("\0");
    aggregate.update(String(stats.size));
    aggregate.update("\0");
    aggregate.update(digest);
    aggregate.update("\n");
  }

  return {
    algorithm: "sha256",
    value: aggregate.digest("hex"),
    fileCount: files.length,
    totalBytes,
    excludes: [DESKTOP_MANIFEST_FILENAME],
  };
}

export async function readDesktopManifest(artifactDir) {
  return readJsonFile(
    path.join(artifactDir, DESKTOP_MANIFEST_FILENAME),
    "desktop provenance manifest",
  );
}
