import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDesktopInstallationIdentity,
  removeDesktopBinariesPreservingState,
} from "./planning_desktop_install_state.mjs";
import {
  assertDesktopInstallationStopped,
  removeWindowsShortcuts,
} from "./planning_v2_desktop_install.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseArgs(argv) {
  const out = {
    target: path.join(os.homedir(), "planning-v2-desktop"),
    appName: "PlanningV2",
    shortcutName: "Planning v2",
    removeShortcuts: true,
    wipeData: false,
    keepWrapper: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--no-shortcuts") {
      out.removeShortcuts = false;
      continue;
    }
    if (token === "--wipe-data") {
      out.wipeData = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`unexpected uninstall argument: ${token}`);
    }
    const rawOption = token.slice(2);
    const equalsIndex = rawOption.indexOf("=");
    const key = asString(equalsIndex >= 0 ? rawOption.slice(0, equalsIndex) : rawOption);
    if (!new Set(["target", "app-name", "shortcut-name", "keep-wrapper"]).has(key)) {
      throw new Error(`unknown uninstall option: --${key || rawOption}`);
    }
    let value = equalsIndex >= 0 ? rawOption.slice(equalsIndex + 1) : "";
    if (equalsIndex < 0) {
      const nextValue = argv[index + 1];
      if (!nextValue || nextValue.startsWith("--")) {
        throw new Error(`--${key} requires a non-empty value`);
      }
      value = nextValue;
      index += 1;
    }
    value = asString(value);
    if (!value) throw new Error(`--${key} requires a non-empty value`);
    if (key === "target") out.target = value;
    if (key === "app-name") out.appName = value;
    if (key === "shortcut-name") out.shortcutName = value;
    if (key === "keep-wrapper") out.keepWrapper = value;
  }
  if (out.keepWrapper && !new Set(["uninstall.cmd", "uninstall.sh"]).has(out.keepWrapper)) {
    throw new Error("--keep-wrapper must be uninstall.cmd or uninstall.sh");
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const targetDir = path.resolve(process.cwd(), args.target);

  if (args.wipeData) {
    process.stderr.write("[planning:v2:desktop:uninstall] --wipe-data is not supported.\n");
    process.stderr.write("Use /ops/security reset with explicit confirmation if you need data wipe.\n");
    process.exit(2);
    return;
  }

  await assertDesktopInstallationIdentity(targetDir);
  const installation = await assertDesktopInstallationStopped({ installDir: targetDir });

  if (args.removeShortcuts && process.platform === "win32") {
    await removeWindowsShortcuts(args.shortcutName, { cwd: path.dirname(targetDir) });
  }

  const preserved = await removeDesktopBinariesPreservingState(targetDir, {
    preserveOwnedEntries: args.keepWrapper ? [args.keepWrapper] : [],
  });

  process.stdout.write(`[planning:v2:desktop:uninstall] removed binaries=${targetDir}\n`);
  process.stdout.write(`[planning:v2:desktop:uninstall] preserved local state=${preserved.join(",") || "none"}\n`);
  process.stdout.write(`[planning:v2:desktop:uninstall] kept dataDir=${installation.dataRoot}\n`);
  process.stdout.write("[planning:v2:desktop:uninstall] data wipe is manual via /ops/security reset.\n");
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`[planning:v2:desktop:uninstall] failed\n${message}\n`);
    process.exit(1);
  });
}
