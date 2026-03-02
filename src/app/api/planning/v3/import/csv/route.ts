import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { importCsvToDraft } from "../../../../../../lib/planning/v3/service/importCsvDraft";

const MAX_CSV_BYTES = 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["text/csv", "text/plain"]);

type ImportSuccessPayload = {
  ok: true;
  cashflow: ReturnType<typeof importCsvToDraft>["cashflows"];
  draftPatch: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
  };
  meta: {
    rows: number;
    months: number;
  };
};

type ImportErrorPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  meta?: Record<string, unknown>;
};

function jsonOk(payload: ImportSuccessPayload): NextResponse<ImportSuccessPayload> {
  return NextResponse.json(payload, { status: 200 });
}

function jsonErr(
  status: number,
  code: string,
  message: string,
  meta?: Record<string, unknown>,
): NextResponse<ImportErrorPayload> {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message },
      ...(meta ? { meta } : {}),
    },
    { status },
  );
}

function normalizeContentType(value: string | null): string {
  if (!value) return "";
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function parseCsvBytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function pickCsrfToken(request: Request): string {
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken && headerToken.trim()) return headerToken.trim();
  const url = new URL(request.url);
  return (url.searchParams.get("csrf") ?? "").trim();
}

function summarizeParseErrors(errors: Array<{ code: string }>): Array<{ code: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of errors) {
    counts.set(row.code, (counts.get(row.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => ({ code, count }));
}

function guardRequest(request: Request): NextResponse<ImportErrorPayload> | null {
  const csrf = pickCsrfToken(request);
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertCsrf(request, { csrf });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return jsonErr(500, "INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    }
    return jsonErr(guard.status, guard.code, guard.message);
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = guardRequest(request);
  if (guarded) return guarded;

  const contentType = normalizeContentType(request.headers.get("content-type"));
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return jsonErr(415, "UNSUPPORTED_MEDIA_TYPE", "text/csv 또는 text/plain 형식만 허용됩니다.");
  }

  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength !== null && contentLength > MAX_CSV_BYTES) {
    return jsonErr(413, "PAYLOAD_TOO_LARGE", "CSV 본문이 최대 크기(1MB)를 초과했습니다.");
  }

  const csvText = await request.text();
  const bodyBytes = parseCsvBytes(csvText);
  if (bodyBytes > MAX_CSV_BYTES) {
    return jsonErr(413, "PAYLOAD_TOO_LARGE", "CSV 본문이 최대 크기(1MB)를 초과했습니다.");
  }
  if (!csvText.trim()) {
    return jsonErr(400, "INPUT", "CSV 본문이 비어 있습니다.");
  }

  const imported = importCsvToDraft(csvText);
  const errorCount = imported.parsed.errors.length;
  if (errorCount > 0) {
    return jsonErr(400, "INPUT", "일부 CSV 행을 해석하지 못했습니다.", {
      rows: imported.parsed.stats.rows,
      skippedRows: imported.parsed.stats.skipped,
      parseErrorSummary: summarizeParseErrors(imported.parsed.errors),
    });
  }
  if (imported.cashflows.length < 1) {
    return jsonErr(400, "INPUT", "유효한 거래 행이 없습니다.", {
      rows: imported.parsed.stats.rows,
      skippedRows: imported.parsed.stats.skipped,
    });
  }

  return jsonOk({
    ok: true,
    cashflow: imported.cashflows,
    draftPatch: {
      monthlyIncomeNet: imported.draft.monthlyIncomeNet,
      monthlyEssentialExpenses: imported.draft.monthlyEssentialExpenses,
      monthlyDiscretionaryExpenses: imported.draft.monthlyDiscretionaryExpenses,
    },
    meta: {
      rows: imported.parsed.stats.rows,
      months: imported.cashflows.length,
    },
  });
}
