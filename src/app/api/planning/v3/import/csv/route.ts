import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import {
  CsvImportInputError,
  importCsvToDraft,
} from "../../../../../../lib/planning/v3/service/importCsvToDraft";
import { createDraft } from "../../../../../../lib/planning/v3/drafts/draftStore";
import { parseCsvText } from "../../../../../../lib/planning/v3/providers/csv/csvParse";

const MAX_CSV_BYTES = 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["text/csv", "text/plain"]);

type ImportSuccessPayload = { ok: true } & ReturnType<typeof importCsvToDraft> & {
  draftId?: string;
  draftSummary: {
    rows: number;
    columns: number;
  };
  data: {
    draftId?: string;
    draftSummary: {
      rows: number;
      columns: number;
    };
  };
};

type ImportErrorPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ code: string; message: string }>;
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
  details?: Array<{ code: string; message: string }>,
  meta?: Record<string, unknown>,
): NextResponse<ImportErrorPayload> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(Array.isArray(details) && details.length > 0 ? { details } : {}),
      },
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

function buildDeterministicDraftId(input: unknown): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(input), "utf-8")
    .digest("hex")
    .slice(0, 24);
  return `d_${hash}`;
}

function pickCsrfToken(request: Request): string {
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken && headerToken.trim()) return headerToken.trim();
  const url = new URL(request.url);
  return (url.searchParams.get("csrf") ?? "").trim();
}

function shouldPersistDraft(url: string): boolean {
  const value = new URL(url).searchParams.get("persist");
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return !(normalized === "0" || normalized === "false" || normalized === "no");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toInputErrorDetails(meta: unknown): Array<{ code: string; message: string }> {
  if (!isRecord(meta)) return [];

  const details: Array<{ code: string; message: string }> = [];

  if (Array.isArray(meta.fields)) {
    const fields = meta.fields
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0)
      .slice(0, 6);
    for (const field of fields) {
      details.push({
        code: "FIELD",
        message: `필수 필드 확인: ${field}`,
      });
    }
  }

  if (Array.isArray(meta.parseErrorSummary)) {
    const summaryRows = meta.parseErrorSummary
      .map((value) => {
        if (!isRecord(value)) return null;
        const code = typeof value.code === "string" ? value.code.trim() : "";
        const count = Number(value.count);
        if (!code || !Number.isFinite(count) || count < 1) return null;
        return { code, count: Math.floor(count) };
      })
      .filter((value): value is { code: string; count: number } => value !== null)
      .slice(0, 10);

    const MESSAGE_BY_CODE: Record<string, string> = {
      MISSING_COLUMN: "필수 컬럼을 찾지 못했습니다.",
      INVALID_AMOUNT: "금액 형식 해석에 실패했습니다.",
      INVALID_DATE: "날짜 형식 해석에 실패했습니다.",
      CSV_ENCODING: "CSV 인코딩 문제를 감지했습니다.",
      INVALID_ROW: "행 데이터 형식이 올바르지 않습니다.",
      INPUT: "입력 값을 확인해 주세요.",
    };

    for (const row of summaryRows) {
      details.push({
        code: row.code,
        message: `${MESSAGE_BY_CODE[row.code] ?? "CSV 행 해석에 실패했습니다."} (${row.count}건)`,
      });
    }
  }

  return details;
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

  try {
    const imported = importCsvToDraft(csvText);
    const parsedHeader = parseCsvText(csvText, { hasHeader: true });
    const columns = Array.isArray(parsedHeader.header) ? parsedHeader.header.length : 0;
    const persist = shouldPersistDraft(request.url);
    const deterministicDraftId = buildDeterministicDraftId({
      cashflow: imported.cashflow,
      draftPatch: imported.draftPatch,
      meta: imported.meta,
      columns,
    });

    const draftSummary = {
      rows: imported.meta.rows,
      columns,
    };

    if (!persist) {
      return jsonOk({
        ok: true,
        ...imported,
        draftSummary,
        data: {
          draftSummary,
        },
      });
    }

    const saved = await createDraft({
      id: deterministicDraftId,
      source: { kind: "csv" },
      payload: {
        cashflow: imported.cashflow,
        draftPatch: imported.draftPatch,
      },
      meta: {
        rows: imported.meta.rows,
        columns,
      },
    });
    const draftId = (saved.id ?? "").trim();
    if (!draftId) {
      return jsonErr(500, "INTERNAL", "초안 저장 결과를 확인하지 못했습니다.", [
        { code: "DRAFT_ID_MISSING", message: "초안 식별자 생성에 실패했습니다." },
      ]);
    }

    return jsonOk({
      ok: true,
      ...imported,
      draftId,
      draftSummary,
      data: {
        draftId,
        draftSummary,
      },
    });
  } catch (error) {
    if (error instanceof CsvImportInputError) {
      return jsonErr(400, error.code, error.message, toInputErrorDetails(error.meta), error.meta);
    }
    return jsonErr(500, "INTERNAL", "CSV 처리 중 오류가 발생했습니다.");
  }
}
