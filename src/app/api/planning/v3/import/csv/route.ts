import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  CsvImportInputError,
  importCsvToDraft,
  type ImportCsvToDraftResult,
} from "@/lib/planning/v3/service/importCsvToDraft";
import { parseCsvText } from "@/lib/planning/v3/providers/csv/csvParse";
import { type CsvColumnMapping } from "@/lib/planning/v3/providers/csv/types";

export const runtime = "nodejs";

const MAX_CSV_BYTES = 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/json",
  "text/csv",
  "text/plain",
]);

type ApiErrorCode =
  | "INPUT"
  | "PARSE"
  | "LIMIT"
  | "INTERNAL"
  | "ORIGIN_MISMATCH"
  | "CSRF_MISMATCH";

type ApiErrorPayload = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};

type ApiSuccessPayload = {
  ok: true;
  data: {
    draftPatch: ImportCsvToDraftResult["draftPatch"];
    monthlyCashflow: ImportCsvToDraftResult["cashflow"];
    meta: {
      rows: number;
      months: number;
    };
    draftSummary: {
      rows: number;
      columns: number;
    };
  };
  // backward compatibility for existing v3 consumers
  draftPatch: ImportCsvToDraftResult["draftPatch"];
  cashflow: ImportCsvToDraftResult["cashflow"];
  meta: {
    rows: number;
    months: number;
  };
  draftSummary: {
    rows: number;
    columns: number;
  };
};

type JsonInput = {
  csvText?: unknown;
  mapping?: {
    dateKey?: unknown;
    date?: unknown;
    amountKey?: unknown;
    amount?: unknown;
    inflowKey?: unknown;
    inflow?: unknown;
    outflowKey?: unknown;
    outflow?: unknown;
    descKey?: unknown;
    desc?: unknown;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeContentType(value: string | null): string {
  if (!value) return "";
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function parseCsvBytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function pickCsrfToken(request: Request): string {
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken && headerToken.trim()) return headerToken.trim();
  const url = new URL(request.url);
  return (url.searchParams.get("csrf") ?? "").trim();
}

function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
): NextResponse<ApiErrorPayload> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

function jsonOk(result: ImportCsvToDraftResult, csvText: string): NextResponse<ApiSuccessPayload> {
  const parsed = parseCsvText(csvText, { hasHeader: true });
  const columns = Array.isArray(parsed.header) ? parsed.header.length : 0;

  return NextResponse.json({
    ok: true,
    data: {
      draftPatch: result.draftPatch,
      monthlyCashflow: result.cashflow,
      meta: {
        rows: result.meta.rows,
        months: result.meta.months,
      },
      draftSummary: {
        rows: result.meta.rows,
        columns,
      },
    },
    draftPatch: result.draftPatch,
    cashflow: result.cashflow,
    meta: {
      rows: result.meta.rows,
      months: result.meta.months,
    },
    draftSummary: {
      rows: result.meta.rows,
      columns,
    },
  });
}

function guardRequest(request: Request): NextResponse<ApiErrorPayload> | null {
  const csrf = pickCsrfToken(request);
  try {
    assertSameOrigin(request);
    requireCsrf(request, { csrf }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return jsonError(500, "INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    }
    return jsonError(guard.status, guard.code as ApiErrorCode, guard.message);
  }
}

function toMapping(input: JsonInput["mapping"]): CsvColumnMapping | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const date = asString(input.dateKey) || asString(input.date);
  const amount = asString(input.amountKey) || asString(input.amount);
  const inflow = asString(input.inflowKey) || asString(input.inflow);
  const outflow = asString(input.outflowKey) || asString(input.outflow);
  const desc = asString(input.descKey) || asString(input.desc);
  if (!date && !amount && !inflow && !outflow && !desc) return undefined;

  return {
    ...(date ? { dateKey: date } : {}),
    ...(amount ? { amountKey: amount } : {}),
    ...(inflow ? { inflowKey: inflow } : {}),
    ...(outflow ? { outflowKey: outflow } : {}),
    ...(desc ? { descKey: desc } : {}),
  };
}

async function parseInputBody(request: Request): Promise<{
  ok: true;
  csvText: string;
  mapping?: CsvColumnMapping;
} | {
  ok: false;
  response: NextResponse<ApiErrorPayload>;
}> {
  const contentType = normalizeContentType(request.headers.get("content-type"));
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return {
      ok: false,
      response: jsonError(415, "INPUT", "application/json 또는 text/csv 형식만 허용됩니다."),
    };
  }

  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength !== null && contentLength > MAX_CSV_BYTES) {
    return {
      ok: false,
      response: jsonError(413, "LIMIT", "CSV 본문이 최대 크기(1MB)를 초과했습니다."),
    };
  }

  if (contentType === "application/json") {
    let body: JsonInput;
    try {
      body = await request.json() as JsonInput;
    } catch {
      return {
        ok: false,
        response: jsonError(400, "INPUT", "JSON 본문 형식이 올바르지 않습니다."),
      };
    }

    const csvText = typeof body.csvText === "string" ? body.csvText : "";
    if (!csvText.trim()) {
      return {
        ok: false,
        response: jsonError(400, "INPUT", "csvText가 비어 있습니다."),
      };
    }
    if (parseCsvBytes(csvText) > MAX_CSV_BYTES) {
      return {
        ok: false,
        response: jsonError(413, "LIMIT", "CSV 본문이 최대 크기(1MB)를 초과했습니다."),
      };
    }

    const mapping = toMapping(body.mapping);
    return {
      ok: true,
      csvText,
      ...(mapping ? { mapping } : {}),
    };
  }

  const csvText = await request.text();
  if (!csvText.trim()) {
    return {
      ok: false,
      response: jsonError(400, "INPUT", "CSV 본문이 비어 있습니다."),
    };
  }
  if (parseCsvBytes(csvText) > MAX_CSV_BYTES) {
    return {
      ok: false,
      response: jsonError(413, "LIMIT", "CSV 본문이 최대 크기(1MB)를 초과했습니다."),
    };
  }

  return { ok: true, csvText };
}

export async function POST(request: Request) {
  const guarded = guardRequest(request);
  if (guarded) return guarded;

  const parsedBody = await parseInputBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const imported = importCsvToDraft(parsedBody.csvText, {
      ...(parsedBody.mapping ? { mapping: parsedBody.mapping } : {}),
    });
    return jsonOk(imported, parsedBody.csvText);
  } catch (error) {
    if (error instanceof CsvImportInputError) {
      return jsonError(
        400,
        error.code === "PARSE" ? "PARSE" : "INPUT",
        error.message,
        error.meta,
      );
    }

    return jsonError(500, "INTERNAL", "CSV 처리 중 오류가 발생했습니다.");
  }
}
