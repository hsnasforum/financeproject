type RootType = "null" | "array" | "object" | "string" | "number" | "boolean" | "undefined" | "function" | "symbol" | "bigint";

export type SchemaShapeSummary = {
  rootType: RootType;
  topLevelKeys: string[];
  resultKeys: string[];
  rowsPath: string | null;
  rowsCount: number | null;
  sampleRowKeys: string[];
};

export type SchemaDriftDiagnostics = {
  traceId: string;
  source: "gov24" | "exchange" | "finlife";
  stage: "http_html" | "json_parse" | "extract_rows" | "normalize";
  endpoint?: string;
  contentType?: string;
  note?: string;
  shape: SchemaShapeSummary;
};

export type SafeSchemaMismatchError = {
  code: "SCHEMA_MISMATCH";
  message: string;
  diagnostics: SchemaDriftDiagnostics;
};

function rootType(value: unknown): RootType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as RootType;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObjectArray(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  return rows;
}

function pickRowSampleKeys(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const first = rows[0] ?? {};
  return Object.keys(first).sort().slice(0, 20);
}

function readByPath(raw: unknown, path: string): unknown {
  const tokens = path.split(".").filter(Boolean);
  let cursor: unknown = raw;
  for (const token of tokens) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[token];
  }
  return cursor;
}

export function safeEndpoint(urlText: string): string {
  try {
    const parsed = new URL(urlText);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "(invalid-url)";
  }
}

export function summarizeSchemaShape(raw: unknown, opts?: { rowPathHints?: string[] }): SchemaShapeSummary {
  const record = isRecord(raw) ? raw : null;
  const topLevelKeys = record ? Object.keys(record).sort().slice(0, 30) : [];
  const resultRecord = record && isRecord(record.result) ? record.result : null;
  const resultKeys = resultRecord ? Object.keys(resultRecord).sort().slice(0, 30) : [];

  const pathHints = opts?.rowPathHints ?? [
    "data",
    "rows",
    "items",
    "result.data",
    "result.rows",
    "result.items",
    "result.baseList",
    "response.body.items.item",
  ];

  for (const path of pathHints) {
    const hit = readByPath(raw, path);
    const rows = asObjectArray(hit);
    if (rows) {
      return {
        rootType: rootType(raw),
        topLevelKeys,
        resultKeys,
        rowsPath: path,
        rowsCount: rows.length,
        sampleRowKeys: pickRowSampleKeys(rows),
      };
    }
  }

  if (Array.isArray(raw)) {
    const rows = asObjectArray(raw) ?? [];
    return {
      rootType: "array",
      topLevelKeys: [],
      resultKeys,
      rowsPath: "(root)",
      rowsCount: rows.length,
      sampleRowKeys: pickRowSampleKeys(rows),
    };
  }

  return {
    rootType: rootType(raw),
    topLevelKeys,
    resultKeys,
    rowsPath: null,
    rowsCount: null,
    sampleRowKeys: [],
  };
}

export function buildSchemaMismatchError(input: {
  source: SchemaDriftDiagnostics["source"];
  stage: SchemaDriftDiagnostics["stage"];
  message: string;
  raw?: unknown;
  rowPathHints?: string[];
  endpoint?: string;
  contentType?: string;
  note?: string;
}): SafeSchemaMismatchError {
  return {
    code: "SCHEMA_MISMATCH",
    message: input.message,
    diagnostics: {
      traceId: `${input.source}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      source: input.source,
      stage: input.stage,
      endpoint: input.endpoint ? safeEndpoint(input.endpoint) : undefined,
      contentType: input.contentType || undefined,
      note: input.note || undefined,
      shape: summarizeSchemaShape(input.raw, { rowPathHints: input.rowPathHints }),
    },
  };
}

export function buildKeyFrequencyReport(rows: Record<string, unknown>[], topN = 30): Array<[string, number]> {
  const counter = new Map<string, number>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN);
}
