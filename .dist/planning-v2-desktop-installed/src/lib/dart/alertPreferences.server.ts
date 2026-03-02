import fs from "node:fs";
import path from "node:path";
import { defaultAlertPrefs, mergePrefs, type AlertPreferences } from "./alertPreferences";

export function alertPrefsPath(cwd = process.cwd()): string {
  return path.join(cwd, "config", "dart-alert-preferences.json");
}

export function loadDefaultPrefs(filePath = alertPrefsPath()): AlertPreferences {
  if (!fs.existsSync(filePath)) return defaultAlertPrefs();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return mergePrefs(defaultAlertPrefs(), parsed as Partial<AlertPreferences>);
  } catch {
    return defaultAlertPrefs();
  }
}
