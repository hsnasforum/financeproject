import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { ImportCsvToBatchInputError, importCsvToBatch } from "@/lib/planning/v3/transactions/store";
import { type CsvColumnMapping } from "@/lib/planning/v3/providers/csv/types";

type ImportBody = {
  csvText?: unknown;
  mapping?: unknown;
  options?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withWriteGuard(request: Request, body: ImportBody): Response | null {
  try {
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

function normalizeMapping(input: unknown): Partial<CsvColumnMapping> | undefined {
  if (input === undefined || input === null) return undefined;
  if (!isRecord(input)) return undefined;

  return {
    ...(asString(input.dateKey) ? { dateKey: asString(input.dateKey) } : {}),
    ...(asString(input.amountKey) ? { amountKey: asString(input.amountKey) } : {}),
    ...(asString(input.inflowKey) ? { inflowKey: asString(input.inflowKey) } : {}),
    ...(asString(input.outflowKey) ? { outflowKey: asString(input.outflowKey) } : {}),
    ...(asString(input.descKey) ? { descKey: asString(input.descKey) } : {}),
  };
}

function normalizeOptions(input: unknown): { accountId?: string; accountName?: string } | undefined {
  if (!isRecord(input)) return undefined;
  return {
    ...(asString(input.accountId) ? { accountId: asString(input.accountId) } : {}),
    ...(asString(input.accountName) ? { accountName: asString(input.accountName) } : {}),
  };
}

export async function POST(request: Request) {
  let body: ImportBody = null;
  try {
    body = (await request.json()) as ImportBody;
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

  const mapping = normalizeMapping(body?.mapping);
  if (body?.mapping !== undefined && body?.mapping !== null && !mapping) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "매핑 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const options = normalizeOptions(body?.options);
  if (body?.options !== undefined && body?.options !== null && !options) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "옵션 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  try {
    const imported = await importCsvToBatch({
      csvText,
      ...(mapping ? { mapping } : {}),
      ...(options ? { options } : {}),
    });

    return NextResponse.json({
      ok: true,
      batchId: imported.batchMeta.id,
      meta: imported.batchMeta,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ImportCsvToBatchInputError) {
      const encodingIssue = error.details.some((row) => asString(row.field) === "csvEncoding");
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: encodingIssue ? "CSV_ENCODING" : "INPUT",
            message: encodingIssue
              ? "CSV 인코딩을 확인해 주세요. UTF-8로 저장한 뒤 다시 시도해 주세요."
              : "CSV 임포트 입력 검증에 실패했습니다.",
          },
          details: error.details,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "CSV 배치 생성에 실패했습니다." } },
      { status: 500 },
    );
  }
}
