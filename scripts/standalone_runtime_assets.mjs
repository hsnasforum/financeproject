import fs from "node:fs";
import path from "node:path";

const PRISMA_DRIVER_ADAPTER_UTILS = "@prisma/driver-adapter-utils";
const BINDINGS = "bindings";
const FILE_URI_TO_PATH = "file-uri-to-path";

function sameResolvedPath(left, right) {
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return false;
  }
}

export function ensureStandaloneAssetLink({ sourcePath, targetPath, label, log = console.log }) {
  if (!fs.existsSync(sourcePath)) return false;

  if (fs.existsSync(targetPath) || fs.lstatSync(targetPath, { throwIfNoEntry: false })) {
    if (sameResolvedPath(sourcePath, targetPath)) return false;
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const linkType = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(fs.realpathSync(sourcePath), targetPath, linkType);
  log(`[standalone_runtime_assets] linked ${label}: ${targetPath} -> ${sourcePath}`);
  return true;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function encodePnpmPackageName(packageName) {
  return packageName.replace("/", "+");
}

function isExactVersionSelector(version) {
  return typeof version === "string" && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

function packagePathFromName(nodeModulesDir, packageName) {
  return path.join(nodeModulesDir, ...packageName.split("/"));
}

function findStandalonePnpmPackage({ nodeModulesDir, packageName, version }) {
  const pnpmDir = path.join(nodeModulesDir, ".pnpm");
  if (!fs.existsSync(pnpmDir)) return null;

  const encodedName = encodePnpmPackageName(packageName);
  const packageDir = packagePathFromName("", packageName);
  const entries = fs.readdirSync(pnpmDir).filter((entry) => entry.startsWith(`${encodedName}@`));
  const shouldMatchExactVersion = isExactVersionSelector(version);
  const exactEntries = shouldMatchExactVersion
    ? entries.filter((entry) => entry.startsWith(`${encodedName}@${version}`))
    : [];
  const candidateEntries = shouldMatchExactVersion ? [...exactEntries, ...entries] : entries;

  for (const entry of candidateEntries) {
    const candidate = path.join(pnpmDir, entry, "node_modules", packageDir);
    if (!fs.existsSync(candidate)) continue;
    if (!shouldMatchExactVersion) return candidate;

    const packageJson = readJson(path.join(candidate, "package.json"));
    if (packageJson?.version === version) return candidate;
  }

  return null;
}

function ensureStandaloneNodeModuleLink({ nodeModulesDir, packageName, version, log }) {
  const sourcePath = findStandalonePnpmPackage({ nodeModulesDir, packageName, version });
  if (!sourcePath) return false;

  return ensureStandaloneAssetLink({
    sourcePath,
    targetPath: packagePathFromName(nodeModulesDir, packageName),
    label: `node_modules/${packageName}`,
    log,
  });
}

function ensureBetterSqliteDependencyLinks({ standaloneDir, log }) {
  const nodeModulesDir = path.join(standaloneDir, "node_modules");
  const betterSqlitePackageJson = readJson(path.join(nodeModulesDir, "better-sqlite3", "package.json"));
  const bindingsSourcePath = findStandalonePnpmPackage({
    nodeModulesDir,
    packageName: BINDINGS,
    version: betterSqlitePackageJson?.dependencies?.[BINDINGS],
  });
  if (!bindingsSourcePath) return;

  ensureStandaloneAssetLink({
    sourcePath: bindingsSourcePath,
    targetPath: packagePathFromName(nodeModulesDir, BINDINGS),
    label: `node_modules/${BINDINGS}`,
    log,
  });

  const bindingsPackageJson = readJson(path.join(bindingsSourcePath, "package.json"));
  ensureStandaloneNodeModuleLink({
    nodeModulesDir,
    packageName: FILE_URI_TO_PATH,
    version: bindingsPackageJson?.dependencies?.[FILE_URI_TO_PATH],
    log,
  });
}

function ensurePrismaAdapterDependencyLinks({ standaloneDir, log }) {
  const nodeModulesDir = path.join(standaloneDir, "node_modules");
  const adapterPackageJson = readJson(
    path.join(nodeModulesDir, "@prisma", "adapter-better-sqlite3", "package.json"),
  );
  const driverAdapterUtilsVersion = adapterPackageJson?.dependencies?.[PRISMA_DRIVER_ADAPTER_UTILS];
  if (typeof driverAdapterUtilsVersion !== "string" || !driverAdapterUtilsVersion) return;

  ensureStandaloneNodeModuleLink({
    nodeModulesDir,
    packageName: PRISMA_DRIVER_ADAPTER_UTILS,
    version: driverAdapterUtilsVersion,
    log,
  });
}

export function ensureStandaloneRuntimeAssets({ standaloneServer, distDir = ".next", cwd = process.cwd(), log = console.log }) {
  const standaloneDir = path.dirname(standaloneServer);
  const distDirPath = path.join(cwd, distDir);

  ensurePrismaAdapterDependencyLinks({ standaloneDir, log });
  ensureBetterSqliteDependencyLinks({ standaloneDir, log });

  ensureStandaloneAssetLink({
    sourcePath: path.join(distDirPath, "static"),
    targetPath: path.join(standaloneDir, distDir, "static"),
    label: `${distDir}/static`,
    log,
  });

  ensureStandaloneAssetLink({
    sourcePath: path.join(cwd, "public"),
    targetPath: path.join(standaloneDir, "public"),
    label: "public",
    log,
  });

  ensureStandaloneAssetLink({
    sourcePath: path.join(cwd, "prisma"),
    targetPath: path.join(standaloneDir, "prisma"),
    label: "prisma",
    log,
  });
}
