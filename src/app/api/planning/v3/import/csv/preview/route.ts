import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { parseCsvText } from "@/lib/planning/v3/providers/csv/csvParse";
import { inferCsvMapping } from "@/lib/planning/v3/providers/csv/inferMapping";
import { previewCsv } from "@/lib/planning/v3/providers/csv/previewCsv";
import { type CsvColumnMapping } from "@/lib/planning/v3/providers/csv/types";
import { validateCsvMapping } from "@/lib/planning/v3/providers/csv/validateMapping";

type PreviewCsvBody = {
  csvText?: unknown;
  mapping?: unknown;
  maxRows?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withWriteGuard(request: Request, body: PreviewCsvBody): Response | null {
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

function normalizePartialMapping(input: unknown): Partial<CsvColumnMapping> | null {
  if (input === undefined || input === null) return null;
  if (!isRecord(input)) return null;

  return {
    ...(asString(input.dateKey) ? { dateKey: asString(input.dateKey) } : {}),
    ...(asString(input.amountKey) ? { amountKey: asString(input.amountKey) } : {}),
    ...(asString(input.inflowKey) ? { inflowKey: asString(input.inflowKey) } : {}),
    ...(asString(input.outflowKey) ? { outflowKey: asString(input.outflowKey) } : {}),
    ...(asString(input.descKey) ? { descKey: asString(input.descKey) } : {}),
  };
}

function hasMappingPayload(mapping: unknown): boolean {
  return mapping !== undefined && mapping !== null;
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: PreviewCsvBody = null;
  try {
    body = (await request.json()) as PreviewCsvBody;
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

  const mappingSuggested = inferCsvMapping(headers);

  const partialMapping = normalizePartialMapping(body?.mapping);
  if (hasMappingPayload(body?.mapping) && !partialMapping) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "매핑 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const mappingCandidate: CsvColumnMapping = hasMappingPayload(body?.mapping)
    ? (partialMapping ?? {})
    : {
        ...(mappingSuggested.dateKey ? { dateKey: mappingSuggested.dateKey } : {}),
        ...(mappingSuggested.amountKey ? { amountKey: mappingSuggested.amountKey } : {}),
        ...(mappingSuggested.inflowKey ? { inflowKey: mappingSuggested.inflowKey } : {}),
        ...(mappingSuggested.outflowKey ? { outflowKey: mappingSuggested.outflowKey } : {}),
        ...(mappingSuggested.descKey ? { descKey: mappingSuggested.descKey } : {}),
      };
  const validation = validateCsvMapping(mappingCandidate, { headers });

  const warnings: string[] = [...mappingSuggested.reasons];

  if (!validation.ok) {
    return NextResponse.json({
      ok: true,
      mappingSuggested,
      validation,
      preview: {
        rows: [],
        stats: {
          total: 0,
          ok: 0,
          failed: 0,
        },
      },
      warnings,
    });
  }

  const preview = previewCsv({
    csvText,
    mapping: mappingCandidate,
    maxRows: asPositiveInt(body?.maxRows),
  });

  if (preview.stats.failed > 0) {
    warnings.push(`파싱 실패 ${preview.stats.failed}건`);
  }

  const reasonCounts = new Map<string, number>();
  for (const row of preview.rows) {
    if (row.ok || !row.reason) continue;
    reasonCounts.set(row.reason, (reasonCounts.get(row.reason) ?? 0) + 1);
  }
  const topReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => `${reason} (${count})`);
  warnings.push(...topReasons);

  return NextResponse.json({
    ok: true,
    mappingSuggested,
    validation,
    preview,
    warnings,
  });
}
