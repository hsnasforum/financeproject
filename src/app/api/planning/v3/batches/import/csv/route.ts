import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { getBatchSummary, ImportCsvToBatchInputError, importCsvToBatch } from "@/lib/planning/v3/batches/store";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withWriteGuard(request: Request, csrfValue: unknown): Response | null {
  try {
    assertSameOrigin(request);
    requireCsrf(request, { csrf: asString(csrfValue) }, { allowWhenCookieMissing: true });
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

async function readCsvPayload(request: Request): Promise<{ csvText: string; fileName?: string; csrf?: string }> {
  const contentType = asString(request.headers.get("content-type")).toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const csvText = file instanceof File ? await file.text() : "";
    const fileName = file instanceof File ? asString(file.name) : "";
    const csrf = asString(form.get("csrf"));
    return { csvText, ...(fileName ? { fileName } : {}), ...(csrf ? { csrf } : {}) };
  }

  if (contentType.includes("text/plain") || contentType.includes("text/csv")) {
    const csvText = await request.text();
    return { csvText };
  }

  try {
    const body = await request.json() as { csvText?: unknown; fileName?: unknown; csrf?: unknown } | null;
    return {
      csvText: asString(body?.csvText),
      ...(asString(body?.fileName) ? { fileName: asString(body?.fileName) } : {}),
      ...(asString(body?.csrf) ? { csrf: asString(body?.csrf) } : {}),
    };
  } catch {
    return { csvText: "" };
  }
}

export async function POST(request: Request) {
  const payload = await readCsvPayload(request);
  const guarded = withWriteGuard(request, payload.csrf);
  if (guarded) return guarded;

  if (!payload.csvText.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "CSV 파일을 선택해 주세요." } },
      { status: 400 },
    );
  }

  try {
    const imported = await importCsvToBatch({
      csvText: payload.csvText,
      sanitizeTextFields: true,
      ...(payload.fileName ? { provenance: { fileName: payload.fileName } } : {}),
    });
    const summary = await getBatchSummary(imported.batchMeta.id);

    const responsePayload = {
      ok: true,
      data: {
        batchId: imported.batchMeta.id,
        createdAt: imported.batchMeta.createdAt,
        summary: {
          months: summary.range?.months ?? summary.monthly.length,
          txns: summary.counts.txns,
          transfers: summary.counts.transfers,
          unassignedCategory: summary.counts.unassignedCategory,
        },
      },
    };
    assertNoForbiddenDraftKeys(responsePayload);
    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    if (error instanceof ImportCsvToBatchInputError) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "CSV 파싱에 실패했습니다. 파일 형식을 확인해 주세요." } },
        { status: 400 },
      );
    }
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "응답 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 생성에 실패했습니다." } },
      { status: 500 },
    );
  }
}
