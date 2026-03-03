import { createHash } from "node:crypto";
import { z } from "zod";
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
import { type CsvColumnMapping } from "../../../../../../lib/planning/v3/providers/csv/types";

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const TEXT_CONTENT_TYPES = new Set(["text/csv", "text/plain"]);
const JSON_CONTENT_TYPE = "application/json";

const CsvColumnMappingSchema = z.object({
  dateKey: z.string().trim().min(1).max(128).optional(),
  amountKey: z.string().trim().min(1).max(128).optional(),
  descKey: z.string().trim().min(1).max(128).optional(),
  typeKey: z.string().trim().min(1).max(128).optional(),
  inflowKey: z.string().trim().min(1).max(128).optional(),
  outflowKey: z.string().trim().min(1).max(128).optional(),
  dateFormatHint: z.string().trim().min(1).max(64).optional(),
  amountSign: z.enum(["inflowPositive", "outflowPositive", "signed"]).optional(),
  delimiter: z.enum([",", "\t", ";"]).optional(),
  encoding: z.enum(["utf-8", "euc-kr"]).optional(),
}).strict();

const JsonImportRequestSchema = z.object({
  csvText: z.string().min(1),
  mapping: CsvColumnMappingSchema.optional(),
  persist: z.boolean().optional(),
  csrf: z.string().trim().min(1).max(256).optional(),
}).strict();

type ImportStats = {
  transactions: number;
  accounts: number;
  period: {
    fromYm?: string;
    toYm?: string;
    months: number;
  };
};

type ImportSuccessPayload = { ok: true } & ReturnType<typeof importCsvToDraft> & {
  warnings: string[];
  stats: ImportStats;
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
    warnings: string[];
    stats: ImportStats;
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

type ParsedImportInput = {
  csvText: string;
  mapping?: CsvColumnMapping;
  persist?: boolean;
  csrf?: string;
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

function pickCsrfToken(request: Request, bodyCsrf?: string): string {
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken && headerToken.trim()) return headerToken.trim();
  if (typeof bodyCsrf === "string" && bodyCsrf.trim()) return bodyCsrf.trim();
  const url = new URL(request.url);
  return (url.searchParams.get("csrf") ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapZodIssues(issues: z.ZodIssue[]): Array<{ code: string; message: string }> {
  return issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.join(".").trim();
      return {
        code: "INPUT_SCHEMA",
        message: path ? `${path}: ${issue.message}` : issue.message,
      };
    });
}

function resolvePersist(url: string, bodyPersist?: boolean): boolean {
  if (typeof bodyPersist === "boolean") return bodyPersist;
  const value = new URL(url).searchParams.get("persist");
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return !(normalized === "0" || normalized === "false" || normalized === "no");
}

function guardRequest(request: Request, csrfToken?: string): NextResponse<ImportErrorPayload> | null {
  const csrf = pickCsrfToken(request, csrfToken);
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

async function parseInput(request: Request, contentType: string): Promise<{
  ok: true;
  value: ParsedImportInput;
} | {
  ok: false;
  response: NextResponse<ImportErrorPayload>;
}> {
  if (contentType === JSON_CONTENT_TYPE) {
    const rawJson = await request.json().catch(() => null);
    if (!isRecord(rawJson)) {
      return {
        ok: false,
        response: jsonErr(400, "INPUT", "요청 본문(JSON)을 해석하지 못했습니다."),
      };
    }

    const parsed = JsonImportRequestSchema.safeParse(rawJson);
    if (!parsed.success) {
      return {
        ok: false,
        response: jsonErr(400, "INPUT", "입력 형식을 확인해 주세요.", mapZodIssues(parsed.error.issues)),
      };
    }

    return {
      ok: true,
      value: {
        csvText: parsed.data.csvText,
        ...(parsed.data.mapping ? { mapping: parsed.data.mapping } : {}),
        ...(typeof parsed.data.persist === "boolean" ? { persist: parsed.data.persist } : {}),
        ...(parsed.data.csrf ? { csrf: parsed.data.csrf } : {}),
      },
    };
  }

  if (TEXT_CONTENT_TYPES.has(contentType)) {
    const csvText = await request.text();
    return {
      ok: true,
      value: { csvText },
    };
  }

  return {
    ok: false,
    response: jsonErr(415, "UNSUPPORTED_MEDIA_TYPE", "application/json 또는 text/csv 형식만 허용됩니다."),
  };
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

  if (Array.isArray(meta.parseErrorRows)) {
    const rows = meta.parseErrorRows
      .map((value) => {
        if (!isRecord(value)) return null;
        const row = Number(value.row);
        const field = typeof value.field === "string" ? value.field.trim() : "";
        const code = typeof value.code === "string" ? value.code.trim() : "";
        if (!Number.isFinite(row) || row < 0 || !code) return null;
        return {
          row: Math.floor(row),
          code,
          ...(field ? { field } : {}),
        };
      })
      .filter((value): value is { row: number; code: string; field?: string } => value !== null)
      .slice(0, 5);

    const MESSAGE_BY_CODE: Record<string, string> = {
      MISSING_COLUMN: "필수 컬럼 누락",
      INVALID_AMOUNT: "금액 형식 오류",
      INVALID_DATE: "날짜 형식 오류",
      CSV_ENCODING: "인코딩 감지 오류",
    };

    for (const row of rows) {
      details.push({
        code: row.code,
        message: `${row.row + 1}행${row.field ? ` ${row.field}열` : ""}: ${MESSAGE_BY_CODE[row.code] ?? "값 해석 실패"}`,
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

function buildImportStats(imported: ReturnType<typeof importCsvToDraft>): ImportStats {
  const months = imported.cashflow.map((row) => row.ym).sort((a, b) => a.localeCompare(b));
  const transactions = imported.cashflow.reduce((sum, row) => sum + Math.max(0, Number(row.txCount) || 0), 0);
  const accounts = transactions > 0 ? 1 : 0;

  return {
    transactions,
    accounts,
    period: {
      ...(months.length > 0 ? { fromYm: months[0], toYm: months[months.length - 1] } : {}),
      months: months.length,
    },
  };
}

function buildWarnings(imported: ReturnType<typeof importCsvToDraft>, stats: ImportStats): string[] {
  const warnings: string[] = [];
  if (imported.meta.rows > stats.transactions) {
    warnings.push(`총 ${imported.meta.rows}행 중 ${stats.transactions}행을 거래로 반영했습니다.`);
  }
  if (stats.period.months > 0 && stats.period.months < 2) {
    warnings.push("분석 기간이 1개월입니다. 추정값의 변동성이 클 수 있습니다.");
  }
  return warnings;
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const contentType = normalizeContentType(request.headers.get("content-type"));
  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength !== null && contentLength > MAX_CSV_BYTES * 2) {
    return jsonErr(413, "PAYLOAD_TOO_LARGE", "요청 본문이 최대 크기(약 2MB CSV)를 초과했습니다.");
  }

  const parsedInput = await parseInput(request, contentType);
  if (!parsedInput.ok) return parsedInput.response;

  const guarded = guardRequest(request, parsedInput.value.csrf);
  if (guarded) return guarded;

  const csvText = parsedInput.value.csvText;
  const bodyBytes = parseCsvBytes(csvText);
  if (bodyBytes > MAX_CSV_BYTES) {
    return jsonErr(413, "PAYLOAD_TOO_LARGE", "CSV 본문이 최대 크기(2MB)를 초과했습니다.");
  }
  if (!csvText.trim()) {
    return jsonErr(400, "INPUT", "CSV 본문이 비어 있습니다.");
  }

  try {
    const imported = importCsvToDraft(csvText, {
      ...(parsedInput.value.mapping ? { mapping: parsedInput.value.mapping } : {}),
    });
    const parsedHeader = parseCsvText(csvText, {
      hasHeader: true,
      ...(parsedInput.value.mapping?.delimiter ? { delimiter: parsedInput.value.mapping.delimiter } : {}),
    });
    const columns = Array.isArray(parsedHeader.header) ? parsedHeader.header.length : 0;
    const stats = buildImportStats(imported);
    const warnings = buildWarnings(imported, stats);
    const persist = resolvePersist(request.url, parsedInput.value.persist);

    const deterministicDraftId = buildDeterministicDraftId({
      cashflow: imported.cashflow,
      draftPatch: imported.draftPatch,
      meta: imported.meta,
      columns,
      mapping: parsedInput.value.mapping ?? null,
    });

    const draftSummary = {
      rows: imported.meta.rows,
      columns,
    };

    if (!persist) {
      return jsonOk({
        ok: true,
        ...imported,
        warnings,
        stats,
        draftSummary,
        data: {
          draftSummary,
          warnings,
          stats,
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
      warnings,
      stats,
      draftId,
      draftSummary,
      data: {
        draftId,
        draftSummary,
        warnings,
        stats,
      },
    });
  } catch (error) {
    if (error instanceof CsvImportInputError) {
      return jsonErr(400, error.code, error.message, toInputErrorDetails(error.meta), error.meta);
    }
    return jsonErr(500, "INTERNAL", "CSV 처리 중 오류가 발생했습니다.");
  }
}
