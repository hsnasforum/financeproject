export type SchemaValueType =
  | "null"
  | "array"
  | "object"
  | "string"
  | "number"
  | "boolean"
  | "undefined"
  | "function"
  | "symbol"
  | "bigint";

export type SchemaFingerprintEntry = {
  path: string;
  types: SchemaValueType[];
};

export type SchemaFingerprint = {
  maxDepth: number;
  arraySampleSize: number;
  entries: SchemaFingerprintEntry[];
};

export type SchemaFingerprintOptions = {
  maxDepth?: number;
  arraySampleSize?: number;
  rootPath?: string;
};

function valueTypeOf(value: unknown): SchemaValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as SchemaValueType;
}

function appendObjectPath(basePath: string, key: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(key)) {
    return `${basePath}.${key}`;
  }
  return `${basePath}[${JSON.stringify(key)}]`;
}

function addType(map: Map<string, Set<SchemaValueType>>, path: string, type: SchemaValueType): void {
  const bucket = map.get(path) ?? new Set<SchemaValueType>();
  bucket.add(type);
  map.set(path, bucket);
}

function walk(
  value: unknown,
  path: string,
  depth: number,
  options: Required<SchemaFingerprintOptions>,
  map: Map<string, Set<SchemaValueType>>,
): void {
  const valueType = valueTypeOf(value);
  addType(map, path, valueType);

  if (depth >= options.maxDepth) return;

  if (Array.isArray(value)) {
    const sampled = value.slice(0, Math.max(0, options.arraySampleSize));
    for (const item of sampled) {
      walk(item, `${path}[]`, depth + 1, options, map);
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  const keys = Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const nextPath = appendObjectPath(path, key);
    walk((value as Record<string, unknown>)[key], nextPath, depth + 1, options, map);
  }
}

export function createSchemaFingerprint(
  json: unknown,
  optionsInput?: SchemaFingerprintOptions,
): SchemaFingerprint {
  const options: Required<SchemaFingerprintOptions> = {
    maxDepth: optionsInput?.maxDepth ?? 8,
    arraySampleSize: optionsInput?.arraySampleSize ?? 3,
    rootPath: optionsInput?.rootPath ?? "$",
  };

  const map = new Map<string, Set<SchemaValueType>>();
  walk(json, options.rootPath, 0, options, map);

  const entries = [...map.entries()]
    .map(([path, types]) => ({
      path,
      types: [...types].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    maxDepth: options.maxDepth,
    arraySampleSize: options.arraySampleSize,
    entries,
  };
}
