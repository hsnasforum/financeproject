import type { SchemaFingerprint, SchemaValueType } from "./schemaFingerprint";

export type SchemaDiffChangeType = "added" | "removed" | "type_changed";

export type SchemaDiffChange = {
  change: SchemaDiffChangeType;
  path: string;
  baselineTypes: SchemaValueType[];
  currentTypes: SchemaValueType[];
};

export type SchemaDiffOptions = {
  ignorePaths?: Array<string | RegExp>;
};

export type SchemaDiffResult = {
  breaking: SchemaDiffChange[];
  nonBreaking: SchemaDiffChange[];
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(glob: string): RegExp {
  const tokens = [...glob].map((char) => {
    if (char === "*") return ".*";
    return escapeRegex(char);
  });
  return new RegExp(`^${tokens.join("")}$`);
}

function buildIgnoreMatchers(ignorePaths: Array<string | RegExp>): RegExp[] {
  return ignorePaths.map((rule) => {
    if (rule instanceof RegExp) return rule;
    return globToRegex(rule);
  });
}

function shouldIgnore(path: string, matchers: RegExp[]): boolean {
  return matchers.some((matcher) => matcher.test(path));
}

function normalizeTypes(types: readonly SchemaValueType[]): SchemaValueType[] {
  return [...new Set(types)].sort((a, b) => a.localeCompare(b));
}

function fingerprintMap(
  fingerprint: SchemaFingerprint,
  matchers: RegExp[],
): Map<string, SchemaValueType[]> {
  const map = new Map<string, SchemaValueType[]>();
  for (const entry of fingerprint.entries) {
    if (shouldIgnore(entry.path, matchers)) continue;
    map.set(entry.path, normalizeTypes(entry.types));
  }
  return map;
}

export function diffSchemaFingerprint(
  baseline: SchemaFingerprint,
  current: SchemaFingerprint,
  options?: SchemaDiffOptions,
): SchemaDiffResult {
  const ignoreMatchers = buildIgnoreMatchers(options?.ignorePaths ?? []);
  const baselineMap = fingerprintMap(baseline, ignoreMatchers);
  const currentMap = fingerprintMap(current, ignoreMatchers);

  const breaking: SchemaDiffChange[] = [];
  const nonBreaking: SchemaDiffChange[] = [];

  const allPaths = new Set<string>([...baselineMap.keys(), ...currentMap.keys()]);
  const sortedPaths = [...allPaths].sort((a, b) => a.localeCompare(b));

  for (const path of sortedPaths) {
    const baselineTypes = baselineMap.get(path) ?? [];
    const currentTypes = currentMap.get(path) ?? [];

    const inBaseline = baselineMap.has(path);
    const inCurrent = currentMap.has(path);

    if (inBaseline && !inCurrent) {
      breaking.push({
        change: "removed",
        path,
        baselineTypes,
        currentTypes: [],
      });
      continue;
    }

    if (!inBaseline && inCurrent) {
      nonBreaking.push({
        change: "added",
        path,
        baselineTypes: [],
        currentTypes,
      });
      continue;
    }

    if (!inBaseline || !inCurrent) continue;

    if (baselineTypes.join("|") !== currentTypes.join("|")) {
      breaking.push({
        change: "type_changed",
        path,
        baselineTypes,
        currentTypes,
      });
    }
  }

  return { breaking, nonBreaking };
}
