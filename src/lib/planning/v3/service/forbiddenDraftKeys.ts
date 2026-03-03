const FORBIDDEN_KEYS = new Set([
  "desc",
  "description",
  "merchant",
  "rawline",
  "originalcsv",
  "memo",
]);

type ForbiddenKeyHit = {
  key: string;
  path: string;
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findForbiddenKey(value: unknown, path = "$"): ForbiddenKeyHit | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const next = findForbiddenKey(value[index], `${path}[${index}]`);
      if (next) return next;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  for (const [key, child] of entries) {
    const normalized = normalizeKey(key);
    if (FORBIDDEN_KEYS.has(normalized)) {
      return { key, path: `${path}.${key}` };
    }
    const nested = findForbiddenKey(child, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

export class ForbiddenDraftKeyError extends Error {
  readonly key: string;
  readonly path: string;

  constructor(input: ForbiddenKeyHit) {
    super(`forbidden key detected: ${input.key}`);
    this.name = "ForbiddenDraftKeyError";
    this.key = input.key;
    this.path = input.path;
  }
}

export function assertNoForbiddenDraftKeys(value: unknown): void {
  const hit = findForbiddenKey(value);
  if (hit) {
    throw new ForbiddenDraftKeyError(hit);
  }
}

