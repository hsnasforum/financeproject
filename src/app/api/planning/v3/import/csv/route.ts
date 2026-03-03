import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { parseCsvText } from "@/lib/planning/v3/providers/csv/csvParse";
import { detectDelimiter } from "@/lib/planning/v3/providers/csv/detectDialect";
import { type CsvColumnMapping, type CsvDelimiter } from "@/lib/planning/v3/providers/csv/types";
import { inferCsvMapping } from "@/lib/planning/v3/providers/csv/infer";
import { importCsvToDraft } from "@/lib/planning/v3/service/importCsvDraft";
import { NextResponse } from "next/server";

type ImportCsvBody = {
  csvText?: unknown;
  mapping?: unknown;
  csrf?: unknown;
} | null;

type NormalizeMappingResult =
  | { ok: true; mapping: CsvColumnMapping }
  | { ok: false; reason: "INVALID_MAPPING" };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toDelimiter(value: unknown): CsvDelimiter | undefined {
  return value === "," || value === "\t" || value === ";" ? value : undefined;
}

function normalizeHeaderName(value: string): string {
  return asString(value).toLowerCase().replace(/\s+/g, "");
}

function withLocalWriteGuard(request: Request, body: ImportCsvBody): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    requireCsrf(request, { csrf: asString(body?.csrf) }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

function normalizeHeaders(headers: string[]): Set<string> {
  return new Set(
    headers.map((header) => normalizeHeaderName(header)).filter((header) => header.length > 0),
  );
}

function hasHeaderKey(headerSet: Set<string>, key: string): boolean {
  return headerSet.has(normalizeHeaderName(key));
}

function normalizeMapping(
  value: unknown,
  headerSet: Set<string>,
): NormalizeMappingResult {
  if (!isRecord(value)) {
    return { ok: false, reason: "INVALID_MAPPING" };
  }

  const dateKey = asString(value.dateKey);
  const amountKey = asString(value.amountKey);
  const inflowKey = asString(value.inflowKey);
  const outflowKey = asString(value.outflowKey);
  const descKey = asString(value.descKey);
  const typeKey = asString(value.typeKey);
  const dateFormatHint = asString(value.dateFormatHint);
  const amountSignRaw = asString(value.amountSign);
  const delimiter = toDelimiter(value.delimiter);
  const encoding = asString(value.encoding);

  if (!dateKey || !hasHeaderKey(headerSet, dateKey)) {
    return { ok: false, reason: "INVALID_MAPPING" };
  }

  const hasAmount = amountKey.length > 0;
  const hasInflow = inflowKey.length > 0;
  const hasOutflow = outflowKey.length > 0;
  if (!hasAmount && !(hasInflow && hasOutflow)) {
    return { ok: false, reason: "INVALID_MAPPING" };
  }

  if (hasAmount && !hasHeaderKey(headerSet, amountKey)) {
    return { ok: false, reason: "INVALID_MAPPING" };
  }
  if (hasInflow && !hasHeaderKey(headerSet, inflowKey)) {
    return { ok: false, reason: "INVALID_MAPPING" };
  }
  if (hasOutflow && !hasHeaderKey(headerSet, outflowKey)) {
    return { ok: false, reason: "INVALID_MAPPING" };
  }
  if (descKey && !hasHeaderKey(headerSet, descKey)) {
    return { ok: false, reason: "INVALID_MAPPING" };
  }
  if (typeKey && !hasHeaderKey(headerSet, typeKey)) {
    return { ok: false, reason: "INVALID_MAPPING" };
  }
  if (amountSignRaw && amountSignRaw !== "signed" && amountSignRaw !== "inflowPositive" && amountSignRaw !== "outflowPositive") {
    return { ok: false, reason: "INVALID_MAPPING" };
  }
  if (encoding && encoding !== "utf-8" && encoding !== "euc-kr") {
    return { ok: false, reason: "INVALID_MAPPING" };
  }

  const amountSign = amountSignRaw
    ? (amountSignRaw as NonNullable<CsvColumnMapping["amountSign"]>)
    : undefined;
  const normalized: CsvColumnMapping = {
    dateKey,
    ...(hasAmount ? { amountKey } : {}),
    ...(!hasAmount && hasInflow ? { inflowKey } : {}),
    ...(!hasAmount && hasOutflow ? { outflowKey } : {}),
    ...(descKey ? { descKey } : {}),
    ...(typeKey ? { typeKey } : {}),
    ...(dateFormatHint ? { dateFormatHint } : {}),
    ...(amountSign ? { amountSign } : {}),
    ...(delimiter ? { delimiter } : {}),
    ...(encoding ? { encoding: encoding as "utf-8" | "euc-kr" } : {}),
  };
  return { ok: true, mapping: normalized };
}

function toErrorResponse(
  code: string,
  options: { issues?: string[] } = {},
): Response {
  if (code === "INPUT_CSV") {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "CSV 입력이 올바르지 않습니다." } },
      { status: 400 },
    );
  }
  if (code === "INVALID_MAPPING") {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "컬럼 매핑이 올바르지 않습니다." } },
      { status: 400 },
    );
  }
  if (code === "PARSE") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INPUT",
          message: "CSV 파싱에 실패했습니다.",
          ...(options.issues && options.issues.length > 0 ? { issues: options.issues } : {}),
        },
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL", message: "CSV 가져오기에 실패했습니다." } },
    { status: 500 },
  );
}

function summarizeParseIssues(errors: Array<{ rowIndex: number; code: string; path: string[] }>): string[] {
  return errors
    .slice(0, 10)
    .map((error) => {
      const rowNo = Math.max(1, Math.trunc(Number(error.rowIndex) || 1));
      const field = asString(error.path?.[0] ?? "field") || "field";
      const reason = error.code === "MISSING_COLUMN"
        ? "missing-column"
        : error.code === "INVALID_DATE"
          ? "invalid-date"
          : "invalid-amount";
      return `row ${rowNo}: ${field} (${reason})`;
    });
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ImportCsvBody = null;
  try {
    body = (await request.json()) as ImportCsvBody;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;
  if (!isRecord(body)) return toErrorResponse("INPUT_CSV");

  const csvText = asString(body.csvText);
  if (!csvText) return toErrorResponse("INPUT_CSV");

  const detectedDelimiter = detectDelimiter(csvText);
  const mappingDelimiterRaw = isRecord(body.mapping) ? toDelimiter(body.mapping.delimiter) : undefined;
  const effectiveDelimiter = mappingDelimiterRaw ?? detectedDelimiter;
  const parsed = parseCsvText(csvText, { hasHeader: true, delimiter: effectiveDelimiter });
  const headers = parsed.header ?? [];
  if (headers.length < 1) return toErrorResponse("INPUT_CSV");
  const headerSet = normalizeHeaders(headers);

  let mapping: CsvColumnMapping | undefined;
  if (body.mapping !== undefined) {
    const normalized = normalizeMapping(body.mapping, headerSet);
    if (!normalized.ok) return toErrorResponse(normalized.reason);
    mapping = normalized.mapping;
  }

  try {
    const imported = importCsvToDraft(csvText, {
      mapping: {
        ...(mapping ?? {}),
        delimiter: effectiveDelimiter,
      },
      hasHeader: true,
    });

    if (imported.parsed.errors.length > 0) {
      return toErrorResponse("PARSE", {
        issues: summarizeParseIssues(imported.parsed.errors),
      });
    }

    const inferred = inferCsvMapping(csvText);
    const mappingUsed = mapping
      ? { ...mapping, delimiter: mapping.delimiter ?? effectiveDelimiter }
      : { ...inferred.suggestions, delimiter: effectiveDelimiter };

    return NextResponse.json({
      ok: true,
      cashflow: imported.cashflows,
      draftPatch: imported.draft,
      meta: {
        rows: imported.parsed.stats.rows,
        months: imported.cashflows.length,
      },
      mappingUsed,
    });
  } catch {
    return toErrorResponse("INTERNAL");
  }
}

