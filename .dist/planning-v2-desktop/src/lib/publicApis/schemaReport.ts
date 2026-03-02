import { buildKeyFrequencyReport, summarizeSchemaShape, type SchemaShapeSummary } from "./schemaDrift";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObjectRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

function readPath(raw: unknown, path: string): unknown {
  const tokens = path.split(".").filter(Boolean);
  let cursor: unknown = raw;
  for (const token of tokens) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[token];
  }
  return cursor;
}

function rowsByShape(raw: unknown, shape: SchemaShapeSummary): Record<string, unknown>[] {
  if (!shape.rowsPath) return [];
  if (shape.rowsPath === "(root)") return asObjectRows(raw);
  return asObjectRows(readPath(raw, shape.rowsPath));
}

export function buildGov24SchemaReport(raw: unknown, topN = 20): {
  shape: SchemaShapeSummary;
  rowKeys: Array<[string, number]>;
} {
  const shape = summarizeSchemaShape(raw, {
    rowPathHints: ["data", "rows", "items", "result.data", "response.data"],
  });
  const rows = rowsByShape(raw, shape);
  return {
    shape,
    rowKeys: buildKeyFrequencyReport(rows, topN),
  };
}

export function buildExchangeSchemaReport(raw: unknown, topN = 20): {
  shape: SchemaShapeSummary;
  rowKeys: Array<[string, number]>;
} {
  const shape = summarizeSchemaShape(raw, {
    rowPathHints: ["data", "rows", "items", "result", "response", "response.data", "result.data"],
  });
  const rows = rowsByShape(raw, shape);
  return {
    shape,
    rowKeys: buildKeyFrequencyReport(rows, topN),
  };
}

export function buildFinlifeRawSchemaReport(raw: unknown, topN = 20): {
  shape: SchemaShapeSummary;
  baseKeys: Array<[string, number]>;
  optionKeys: Array<[string, number]>;
} {
  const shape = summarizeSchemaShape(raw, {
    rowPathHints: ["result.baseList", "result.optionList"],
  });
  const baseRows = asObjectRows(readPath(raw, "result.baseList"));
  const optionRows = asObjectRows(readPath(raw, "result.optionList"));
  return {
    shape,
    baseKeys: buildKeyFrequencyReport(baseRows, topN),
    optionKeys: buildKeyFrequencyReport(optionRows, topN),
  };
}
