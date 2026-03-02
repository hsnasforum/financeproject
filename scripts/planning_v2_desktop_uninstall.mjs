import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveWindowsDataBase(env = process.env) {
  const localAppData = asString(env.LOCALAPPDATA);
  const appData = asString(env.APPDATA);
  if (localAppData) return localAppData;
  if (appData) return appData;
  return path.join(os.homedir(), "AppData", "Local");
}

function resolveDataDir(appName, env = process.env) {
  const override = asString(env.PLANNING_DATA_DIR);
  if (override) return path.resolve(process.cwd(), override);
  if (process.platform === "win32") return path.resolve(resolveWindowsDataBase(env), appName);
  if (process.platform === "darwin") return path.resolve(os.homedir(), "Library", "Application Support", appName);
  return path.resolve(asString(env.XDG_DATA_HOME) || path.join(os.homedir(), ".local", "share"), appName);
}

function parseArgs(argv) {
  const out = {
    target: path.join(os.homedir(), "planning-v2-desktop"),
    appName: "PlanningV2",
    shortcutName: "Planning v2",
    removeShortcuts: true,
    wipeData: false,
  };
  for (const token of argv) {
    if (token === "--no-shortcuts") {
      out.removeShortcuts = false;
      continue;
    }
    if (token === "--wipe-data") {
      out.wipeData = true;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rawRest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rawRest.join("=");
    if (key === "target") out.target = asString(value) || out.target;
    if (key === "app-name") out.appName = asString(value) || out.appName;
    if (key === "shortcut-name") out.shortcutName = asString(value) || out.shortcutName;
  }
  return out;
}

async function removeIfExists(target) {
  await fs.rm(target, { recursive: true, force: true }).catch(() => undefined);
}

async function removeWindowsShortcuts(shortcutName) {
  const desktop = path.join(asString(process.env.USERPROFILE) || os.homedir(), "Desktop");
  const startMenu = path.join(asString(process.env.APPDATA) || path.join(os.homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs");
  const fileName = `${shortcutName}.lnk`;
  await removeIfExists(path.join(desktop, fileName));
  await removeIfExists(path.join(startMenu, fileName));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDir = path.resolve(process.cwd(), args.target);
  const dataDir = resolveDataDir(args.appName);

  if (args.wipeData) {
    process.stderr.write("[planning:v2:desktop:uninstall] --wipe-data is not supported.\n");
    process.stderr.write("Use /ops/security reset with explicit confirmation if you need data wipe.\n");
    process.exit(2);
    return;
  }

  if (args.removeShortcuts && process.platform === "win32") {
    await removeWindowsShortcuts(args.shortcutName);
  }

  await removeIfExists(targetDir);

  process.stdout.write(`[planning:v2:desktop:uninstall] removed binaries=${targetDir}\n`);
  process.stdout.write(`[planning:v2:desktop:uninstall] kept dataDir=${dataDir}\n`);
  process.stdout.write("[planning:v2:desktop:uninstall] data wipe is manual via /ops/security reset.\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[planning:v2:desktop:uninstall] failed\n${message}\n`);
  process.exit(1);
});
