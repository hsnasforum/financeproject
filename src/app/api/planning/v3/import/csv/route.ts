import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { parseCsvText } from "@/lib/planning/v3/providers/csv/csvParse";
import { type CsvColumnMapping } from "@/lib/planning/v3/providers/csv/types";
import { validateCsvMapping } from "@/lib/planning/v3/providers/csv/validateMapping";
import { importCsvToDraft } from "@/lib/planning/v3/service/importCsvDraft";

type ImportCsvBody = {
  csvText?: unknown;
  mapping?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withWriteGuard(request: Request, body: ImportCsvBody): Response | null {
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

function normalizeMapping(input: unknown): CsvColumnMapping | null {
  if (input === undefined || input === null) return null;
  if (!isRecord(input)) return null;

  const mapping: CsvColumnMapping = {
    ...(asString(input.dateKey) ? { dateKey: asString(input.dateKey) } : {}),
    ...(asString(input.amountKey) ? { amountKey: asString(input.amountKey) } : {}),
    ...(asString(input.inflowKey) ? { inflowKey: asString(input.inflowKey) } : {}),
    ...(asString(input.outflowKey) ? { outflowKey: asString(input.outflowKey) } : {}),
    ...(asString(input.descKey) ? { descKey: asString(input.descKey) } : {}),
  };

  return mapping;
}

function hasMappingPayload(input: unknown): boolean {
  return input !== undefined && input !== null;
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

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const csvText = asString(body?.csvText);
  if (!csvText) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "CSV 텍스트를 입력해 주세요." } },
      { status: 400 },
    );
  }

  const parsedHeader = parseCsvText(csvText, { hasHeader: true });
  const headers = parsedHeader.header ?? [];
  if (headers.length < 1) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "헤더 행을 찾을 수 없습니다." } },
      { status: 400 },
    );
  }

  const mapping = normalizeMapping(body?.mapping);
  if (hasMappingPayload(body?.mapping) && !mapping) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "매핑 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  if (mapping) {
    const validated = validateCsvMapping(mapping, { headers });
    if (!validated.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INPUT", message: "매핑 검증에 실패했습니다." },
          details: validated.errors,
        },
        { status: 400 },
      );
    }
  }

  try {
    const imported = importCsvToDraft(csvText, {
      ...(mapping ? { mapping } : {}),
    });

    if (imported.parsed.errors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "PARSE", message: "CSV 파싱 중 오류가 발생했습니다." },
          details: imported.parsed.errors.map((entry) => ({
            row: entry.rowIndex,
            field: entry.path[0] ?? "row",
            code: entry.code,
          })),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      cashflow: imported.cashflows,
      meta: {
        rows: imported.parsed.stats.parsed,
        months: imported.cashflows.length,
      },
      draftPatch: imported.draft,
      mappingUsed: mapping,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "CSV 가져오기에 실패했습니다." } },
      { status: 500 },
    );
  }
}
