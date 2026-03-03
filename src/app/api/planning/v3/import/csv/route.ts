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
import { parseCsvText } from "../../../../../../lib/planning/v3/providers/csv/csvParse";

export const runtime = "nodejs";

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_CSV_BYTES + 16 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["text/csv", "text/plain", "application/json"]);

type ImportSuccessPayload = { ok: true } & ReturnType<typeof importCsvToDraft> & {
  draftSummary: {
    rows: number;
    columns: number;
  };
  data: {
    monthlyCashflow: ReturnType<typeof importCsvToDraft>["cashflow"];
    draftPatch: ReturnType<typeof importCsvToDraft>["draftPatch"];
    meta: ReturnType<typeof importCsvToDraft>["meta"];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCsvFromJson(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!isRecord(parsed)) return "";
    const csvText = parsed.csvText;
    return typeof csvText === "string" ? csvText : "";
  } catch {
    return "";
  }
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
    return jsonErr(415, "UNSUPPORTED_MEDIA_TYPE", "application/json, text/csv 또는 text/plain 형식만 허용됩니다.");
  }

  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength !== null && contentLength > MAX_REQUEST_BYTES) {
    return jsonErr(413, "PAYLOAD_TOO_LARGE", "요청 본문이 최대 크기를 초과했습니다.");
  }

  const rawBody = await request.text();
  const bodyBytes = parseCsvBytes(rawBody);
  if (bodyBytes > MAX_REQUEST_BYTES) {
    return jsonErr(413, "PAYLOAD_TOO_LARGE", "요청 본문이 최대 크기를 초과했습니다.");
  }

  const csvText = contentType === "application/json"
    ? parseCsvFromJson(rawBody)
    : rawBody;

  const csvBytes = parseCsvBytes(csvText);
  if (csvBytes > MAX_CSV_BYTES) {
    return jsonErr(413, "PAYLOAD_TOO_LARGE", "CSV 본문이 최대 크기(1MB)를 초과했습니다.");
  }

  if (!csvText.trim()) {
    return jsonErr(400, "INPUT", "CSV 본문이 비어 있습니다.");
  }

  try {
    const imported = importCsvToDraft(csvText);
    const parsedHeader = parseCsvText(csvText, { hasHeader: true });
    const columns = Array.isArray(parsedHeader.header) ? parsedHeader.header.length : 0;

    const draftSummary = {
      rows: imported.meta.rows,
      columns,
    };

    return jsonOk({
      ok: true,
      ...imported,
      draftSummary,
      data: {
        monthlyCashflow: imported.cashflow,
        draftPatch: imported.draftPatch,
        meta: imported.meta,
        draftSummary,
      },
    });
  } catch (error) {
    if (error instanceof CsvImportInputError) {
      return jsonErr(400, error.code, error.message, error.meta);
    }
    return jsonErr(500, "INTERNAL", "CSV 처리 중 오류가 발생했습니다.");
  }
}
