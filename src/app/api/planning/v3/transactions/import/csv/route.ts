import {
  NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import { ImportCsvToBatchInputError,
  importCurrentUserCsvToBatch } from "@/lib/planning/v3/service/batchImportRepository";
import { type CsvColumnMapping } from "@/lib/planning/v3/providers/csv/types";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

type ImportBody = {
  csvText?: unknown;
  mapping?: unknown;
  fileName?: unknown;
  accountId?: unknown;
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

export async function POST(request: Request) {
  let body: ImportBody = null;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const csvText = asString(body?.csvText);
    if (!csvText) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "CSV 텍스트를 입력해 주세요." }, meta: userMeta },
        { status: 400 },
      );
    }

    const mapping = normalizeMapping(body?.mapping);
    if (body?.mapping !== undefined && body?.mapping !== null && !mapping) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "매핑 형식이 올바르지 않습니다." }, meta: userMeta },
        { status: 400 },
      );
    }

    const accountId = asString(body?.accountId);
    if (!accountId) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "거래 계좌를 선택해 주세요." }, meta: userMeta },
        { status: 400 },
      );
    }

    try {
      const imported = await importCurrentUserCsvToBatch({
        csvText,
        ...(mapping ? { mapping } : {}),
        ...(asString(body?.fileName) ? { provenance: { fileName: asString(body?.fileName) } } : {}),
        options: { accountId },
      });
      const rows = imported.metadataHandoff.diagnostics.rows;
      const parsed = imported.metadataHandoff.diagnostics.parsed;
      const skipped = imported.metadataHandoff.diagnostics.skipped;
      const batch = {
        id: imported.batchMeta.id,
        createdAt: imported.batchMeta.createdAt,
        kind: "csv" as const,
        ...(asString(body?.fileName) ? { fileName: asString(body?.fileName) } : {}),
        accountId,
        accountHint: accountId,
        total: rows,
        ok: parsed,
        failed: skipped,
      };

      return NextResponse.json({
        ok: true,
        batchId: imported.batchMeta.id,
        batch,
        stats: {
          total: rows,
          ok: parsed,
          failed: skipped,
          stored: imported.transactions.length,
          deduped: Math.max(0, parsed - imported.transactions.length),
        },
        sample: [],
        meta: userMeta,
      }, { status: 201 });
    } catch (error) {
      if (error instanceof ImportCsvToBatchInputError) {
        const isEncodingIssue = error.details.some((detail) => asString(detail.field) === "csvEncoding");
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: isEncodingIssue ? "CSV_ENCODING" : "INPUT",
              message: isEncodingIssue
                ? "CSV 인코딩을 확인해 주세요. UTF-8로 저장한 뒤 다시 시도해 주세요."
                : "CSV 임포트 입력 검증에 실패했습니다.",
            },
            details: error.details,
            meta: userMeta,
          },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "배치 저장에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}
