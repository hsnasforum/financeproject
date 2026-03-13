"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  BodyActionLink,
  BodyEmptyState,
  BodyInset,
  BodySectionHeading,
  BodyStatusInset,
  BodyTableFrame,
  bodyChoiceRowClassName,
  bodyCompactFieldClassName,
  bodyFieldClassName,
  bodyTextAreaClassName,
} from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";
import { parseCsvText } from "@/lib/planning/v3/providers/csv/csvParse";
import { inferCsvMapping } from "@/lib/planning/v3/providers/csv/inferMapping";
import { type CsvColumnMapping, type CsvMappingInferResult, type CsvMappingValidationError, type CsvMappingValidationResult } from "@/lib/planning/v3/providers/csv/types";
import { validateCsvMapping } from "@/lib/planning/v3/providers/csv/validateMapping";

type AmountMode = "amount" | "inout";

type MappingState = {
  dateKey: string;
  amountKey: string;
  inflowKey: string;
  outflowKey: string;
  descKey: string;
  amountMode: AmountMode;
};

type ImportCashflowRow = {
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount: number;
};

type ImportResult = {
  cashflow: ImportCashflowRow[];
  meta: {
    rows: number;
    months: number;
  };
  draftPatch: Record<string, unknown>;
  mappingUsed?: CsvColumnMapping | null;
};

type ApiError = {
  message: string;
  details: string[];
};

type SavedBatch = {
  id: string;
  total: number;
  ok: number;
  failed: number;
};

type PreviewRow = {
  line: number;
  dateIso?: string;
  amountKrw?: number;
  descMasked?: string;
  ok: boolean;
  reason?: string;
};

type PreviewStats = {
  total: number;
  ok: number;
  failed: number;
  inferredMonths?: number;
};

type PreviewApiPayload = {
  ok: true;
  mappingSuggested: CsvMappingInferResult;
  validation: CsvMappingValidationResult;
  preview: {
    rows: PreviewRow[];
    stats: PreviewStats;
  };
  warnings: string[];
};

type Account = {
  id: string;
  name: string;
  kind: "checking" | "saving" | "card" | "cash" | "other";
  currency: "KRW";
  note?: string;
};

const INITIAL_MAPPING: MappingState = {
  dateKey: "",
  amountKey: "",
  inflowKey: "",
  outflowKey: "",
  descKey: "",
  amountMode: "amount",
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function confidenceVariant(value: "high" | "mid" | "low"): "success" | "warning" | "outline" {
  if (value === "high") return "success";
  if (value === "mid") return "warning";
  return "outline";
}

function toMappingPayload(mapping: MappingState): CsvColumnMapping {
  return {
    ...(mapping.dateKey ? { dateKey: mapping.dateKey } : {}),
    ...(mapping.amountMode === "amount"
      ? (mapping.amountKey ? { amountKey: mapping.amountKey } : {})
      : {
          ...(mapping.inflowKey ? { inflowKey: mapping.inflowKey } : {}),
          ...(mapping.outflowKey ? { outflowKey: mapping.outflowKey } : {}),
        }),
    ...(mapping.descKey ? { descKey: mapping.descKey } : {}),
  };
}

function applyInferredMapping(inferred: CsvMappingInferResult): MappingState {
  const mode: AmountMode = inferred.amountKey
    ? "amount"
    : (inferred.inflowKey && inferred.outflowKey ? "inout" : "amount");

  return {
    dateKey: inferred.dateKey ?? "",
    amountKey: inferred.amountKey ?? "",
    inflowKey: inferred.inflowKey ?? "",
    outflowKey: inferred.outflowKey ?? "",
    descKey: inferred.descKey ?? "",
    amountMode: mode,
  };
}

function extractApiError(payload: unknown): ApiError {
  if (!isRecord(payload)) {
    return { message: "요청 처리에 실패했습니다.", details: [] };
  }

  const details = Array.isArray(payload.details)
    ? payload.details.map((entry) => {
      if (!isRecord(entry)) return "";
      const field = asString(entry.field);
      const message = asString(entry.message);
      const code = asString(entry.code);
      if (field && message) return `${field}: ${message}`;
      if (field && code) return `${field}: ${code}`;
      if (message) return message;
      if (code) return code;
      return "";
    }).filter((entry) => entry.length > 0)
    : [];

  const errorMessage = isRecord(payload.error) ? asString(payload.error.message) : "";
  return {
    message: errorMessage || "요청 처리에 실패했습니다.",
    details,
  };
}

function hasCustomMappingSelection(
  mapping: MappingState,
  inferred: CsvMappingInferResult | null,
): boolean {
  const current = toMappingPayload(mapping);
  if (!inferred) return Object.keys(current).length > 0;

  const suggested = toMappingPayload(applyInferredMapping(inferred));
  const keys = new Set([...Object.keys(current), ...Object.keys(suggested)]);
  for (const key of keys) {
    if (asString(current[key as keyof CsvColumnMapping]) !== asString(suggested[key as keyof CsvColumnMapping])) {
      return true;
    }
  }
  return false;
}

function isImportResult(payload: unknown): payload is ImportResult {
  if (!isRecord(payload)) return false;
  if (!Array.isArray(payload.cashflow) || !isRecord(payload.meta) || !isRecord(payload.draftPatch)) return false;

  return payload.cashflow.every((row) => isRecord(row)
    && asString(row.ym).length > 0
    && Number.isFinite(Number(row.incomeKrw))
    && Number.isFinite(Number(row.expenseKrw))
    && Number.isFinite(Number(row.netKrw))
    && Number.isFinite(Number(row.txCount)));
}

function isCsvMappingInferResult(payload: unknown): payload is CsvMappingInferResult {
  if (!isRecord(payload)) return false;
  if (!isRecord(payload.confidence) || !Array.isArray(payload.reasons)) return false;
  return true;
}

function isCsvMappingValidationResult(payload: unknown): payload is CsvMappingValidationResult {
  if (!isRecord(payload)) return false;
  if (payload.ok === true) return true;
  if (payload.ok === false) {
    return Array.isArray(payload.errors) && payload.errors.every((entry) => isRecord(entry) && asString(entry.field).length > 0);
  }
  return false;
}

function isPreviewRow(payload: unknown): payload is PreviewRow {
  if (!isRecord(payload)) return false;
  if (!Number.isFinite(Number(payload.line)) || typeof payload.ok !== "boolean") return false;
  return true;
}

function isPreviewApiPayload(payload: unknown): payload is PreviewApiPayload {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!isCsvMappingInferResult(payload.mappingSuggested)) return false;
  if (!isCsvMappingValidationResult(payload.validation)) return false;
  if (!isRecord(payload.preview) || !Array.isArray(payload.preview.rows) || !isRecord(payload.preview.stats)) return false;
  if (!payload.preview.rows.every(isPreviewRow)) return false;
  if (!Array.isArray(payload.warnings)) return false;
  return true;
}

function isAccount(payload: unknown): payload is Account {
  if (!isRecord(payload)) return false;
  if (!asString(payload.id) || !asString(payload.name)) return false;
  return ["checking", "saving", "card", "cash", "other"].includes(asString(payload.kind));
}

function validationErrorsFromResult(result: CsvMappingValidationResult): CsvMappingValidationError[] {
  return result.ok ? [] : result.errors;
}

function summarizeTopReasons(rows: PreviewRow[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.ok || !row.reason) continue;
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => `${reason} (${count})`);
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

function buildImportDraftPath(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "/api/planning/v3/import/csv";
  return `/api/planning/v3/import/csv?csrf=${encodeURIComponent(csrf)}`;
}

export function ImportCsvClient() {
  const [csvText, setCsvText] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [inferred, setInferred] = useState<CsvMappingInferResult | null>(null);
  const [mapping, setMapping] = useState<MappingState>(INITIAL_MAPPING);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewValidationErrors, setPreviewValidationErrors] = useState<CsvMappingValidationError[]>([]);

  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveBatchLoading, setSaveBatchLoading] = useState(false);
  const [savedBatch, setSavedBatch] = useState<SavedBatch | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [saveDraftLoading, setSaveDraftLoading] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [directImportLoading, setDirectImportLoading] = useState(false);
  const [directImportError, setDirectImportError] = useState("");
  const [directImportStatus, setDirectImportStatus] = useState("");

  useEffect(() => {
    const parsed = parseCsvText(csvText, { hasHeader: true });
    const nextHeaders = parsed.header ?? [];
    setHeaders(nextHeaders);

    if (nextHeaders.length < 1) {
      setInferred(null);
      setMapping(INITIAL_MAPPING);
      setPreviewRows([]);
      setPreviewStats(null);
      setPreviewWarnings([]);
      setPreviewValidationErrors([]);
      return;
    }

    const suggested = inferCsvMapping(nextHeaders);
    setInferred(suggested);
    setMapping(applyInferredMapping(suggested));
  }, [csvText]);

  useEffect(() => {
    let disposed = false;

    async function loadAccounts() {
      setAccountLoading(true);
      try {
        const response = await fetch(`/api/planning/v3/accounts${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !isRecord(payload) || payload.ok !== true || !Array.isArray(payload.items)) {
          if (!disposed) {
            setAccounts([]);
          }
          return;
        }

        if (!disposed) {
          const items = payload.items.filter(isAccount);
          setAccounts(items);
          if (items.length > 0) {
            setSelectedAccountId((prev) => prev || items[0].id);
          }
        }
      } catch {
        if (!disposed) {
          setAccounts([]);
        }
      } finally {
        if (!disposed) {
          setAccountLoading(false);
        }
      }
    }

    void loadAccounts();

    return () => {
      disposed = true;
    };
  }, []);

  const mappingPayload = useMemo(() => toMappingPayload(mapping), [mapping]);

  const mappingErrors = useMemo(() => {
    if (headers.length < 1) {
      return [{ field: "headers", message: "헤더 행을 찾을 수 없습니다." } satisfies CsvMappingValidationError];
    }
    return validationErrorsFromResult(validateCsvMapping(mappingPayload, { headers }));
  }, [headers, mappingPayload]);

  useEffect(() => {
    if (!csvText.trim() || headers.length < 1) {
      setPreviewRows([]);
      setPreviewStats(null);
      setPreviewWarnings([]);
      setPreviewValidationErrors([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const response = await fetch("/api/planning/v3/import/csv/preview", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(withDevCsrf({
            csvText,
            mapping: mappingPayload,
            maxRows: 30,
          })),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          if (!controller.signal.aborted) {
            setPreviewRows([]);
            setPreviewStats(null);
            setPreviewWarnings([]);
            setPreviewValidationErrors([]);
          }
          return;
        }

        if (!isPreviewApiPayload(payload)) {
          if (!controller.signal.aborted) {
            setPreviewRows([]);
            setPreviewStats(null);
            setPreviewWarnings([]);
            setPreviewValidationErrors([]);
          }
          return;
        }

        if (!controller.signal.aborted) {
          setInferred(payload.mappingSuggested);
          setPreviewRows(payload.preview.rows.map((row) => ({
            line: asNumber(row.line),
            ...(asString(row.dateIso) ? { dateIso: asString(row.dateIso) } : {}),
            ...(Number.isFinite(Number(row.amountKrw)) ? { amountKrw: asNumber(row.amountKrw) } : {}),
            ...(asString(row.descMasked) ? { descMasked: asString(row.descMasked) } : {}),
            ok: Boolean(row.ok),
            ...(asString(row.reason) ? { reason: asString(row.reason) } : {}),
          })));
          setPreviewStats({
            total: asNumber(payload.preview.stats.total),
            ok: asNumber(payload.preview.stats.ok),
            failed: asNumber(payload.preview.stats.failed),
            ...(Number.isFinite(Number(payload.preview.stats.inferredMonths))
              ? { inferredMonths: asNumber(payload.preview.stats.inferredMonths) }
              : {}),
          });
          setPreviewWarnings(payload.warnings.map((entry) => asString(entry)).filter((entry) => entry.length > 0));
          setPreviewValidationErrors(validationErrorsFromResult(payload.validation));
        }
      } catch {
        if (!controller.signal.aborted) {
          setPreviewRows([]);
          setPreviewStats(null);
          setPreviewWarnings([]);
          setPreviewValidationErrors([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [csvText, headers.length, mappingPayload]);

  const previewTopReasons = useMemo(() => summarizeTopReasons(previewRows), [previewRows]);

  const canRunImport = csvText.trim().length > 0
    && mappingErrors.length < 1
    && previewValidationErrors.length < 1
    && !previewLoading;

  async function onUploadCsvFile(file: File) {
    const text = await file.text();
    setCsvText(text);
    setSelectedFileName(file.name);
    setApiError(null);
    setSavedBatch(null);
    setResult(null);
    setSavedDraftId("");
  }

  async function handleDirectBatchImport() {
    if (!csvText.trim() || directImportLoading) return;

    setDirectImportLoading(true);
    setDirectImportError("");
    setDirectImportStatus("CSV 배치를 생성하는 중입니다...");

    try {
      const response = await fetch("/api/planning/v3/transactions/batches/import-csv", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          csvText,
          ...(headers.length > 0 ? { mapping: mappingPayload } : {}),
        })),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !asString(payload.batchId)) {
        const extracted = extractApiError(payload);
        setDirectImportError(extracted.message);
        setDirectImportStatus("");
        return;
      }

      setDirectImportStatus("배치 저장이 완료되어 목록 페이지로 이동합니다.");
      window.location.assign("/planning/v3/transactions/batches");
    } catch {
      setDirectImportError("CSV 배치 저장에 실패했습니다.");
      setDirectImportStatus("");
    } finally {
      setDirectImportLoading(false);
    }
  }

  async function handleImport() {
    if (!canRunImport) return;

    setSubmitting(true);
    setApiError(null);
    setSavedBatch(null);
    setResult(null);
    setSavedDraftId("");

    try {
      const csrf = readDevCsrfToken();
      const response = await fetch(buildImportDraftPath(), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({
          csvText,
          mapping: mappingPayload,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setApiError(extractApiError(payload));
        return;
      }

      if (!isImportResult(payload)) {
        setApiError({ message: "응답 형식이 올바르지 않습니다.", details: [] });
        return;
      }

      setResult({
        cashflow: payload.cashflow.map((row) => ({
          ym: asString(row.ym),
          incomeKrw: asNumber(row.incomeKrw),
          expenseKrw: asNumber(row.expenseKrw),
          netKrw: asNumber(row.netKrw),
          txCount: asNumber(row.txCount),
        })),
        meta: {
          rows: asNumber(payload.meta.rows),
          months: asNumber(payload.meta.months),
        },
        draftPatch: payload.draftPatch,
        mappingUsed: hasCustomMappingSelection(mapping, inferred) ? mappingPayload : null,
      });
    } catch {
      setApiError({ message: "CSV 가져오기에 실패했습니다.", details: [] });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveBatch() {
    if (!canRunImport || !previewStats || previewStats.ok < 1) return;
    if (!selectedAccountId) {
      setApiError({ message: "배치 저장 전에 거래 계좌를 선택해 주세요.", details: [] });
      return;
    }

    setSaveBatchLoading(true);
    setApiError(null);

    try {
      const response = await fetch("/api/planning/v3/transactions/import/csv", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          csvText,
          mapping: mappingPayload,
          ...(selectedFileName ? { fileName: selectedFileName } : {}),
          accountId: selectedAccountId,
        })),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.batch) || !isRecord(payload.stats)) {
        setApiError(extractApiError(payload));
        return;
      }

      const id = asString(payload.batch.id);
      if (!id) {
        setApiError({ message: "배치 저장 응답 형식이 올바르지 않습니다.", details: [] });
        return;
      }

      setSavedBatch({
        id,
        total: asNumber(payload.stats.total),
        ok: asNumber(payload.stats.ok),
        failed: asNumber(payload.stats.failed),
      });
    } catch {
      setApiError({ message: "배치 저장에 실패했습니다.", details: [] });
    } finally {
      setSaveBatchLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (!result) return;

    setSaveDraftLoading(true);
    setApiError(null);

    try {
      const response = await fetch("/api/planning/v3/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          source: {
            kind: "csv",
            rows: result.meta.rows,
            months: result.meta.months,
          },
          cashflow: result.cashflow,
          draftPatch: result.draftPatch,
        })),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !asString(payload.id)) {
        setApiError({ message: "초안 저장에 실패했습니다.", details: [] });
        return;
      }

      setSavedDraftId(asString(payload.id));
    } catch {
      setApiError({ message: "초안 저장에 실패했습니다.", details: [] });
    } finally {
      setSaveDraftLoading(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 CSV Import</h1>
          <p className="text-sm text-slate-600">CSV 헤더 추천 매핑 + 파싱 미리보기 진단으로 안전하게 초안을 생성합니다.</p>

          <BodyInset className="space-y-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="v3-import-file">CSV 파일</label>
            <input
              accept=".csv,text/csv"
              className={bodyFieldClassName}
              data-testid="v3-csv-file"
              id="v3-import-file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                void onUploadCsvFile(file);
              }}
              type="file"
            />
            {selectedFileName ? <p className="text-xs text-slate-500">선택 파일: {selectedFileName}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                data-testid="v3-csv-import-submit"
                disabled={!csvText.trim() || directImportLoading}
                onClick={() => {
                  void handleDirectBatchImport();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {directImportLoading ? "배치 저장 중..." : "CSV 배치로 저장"}
              </Button>
              <BodyActionLink className="text-xs" href="/planning/v3/transactions/batches">
                배치 목록 보기
              </BodyActionLink>
            </div>
            {directImportStatus ? <p className="text-xs text-slate-600">{directImportStatus}</p> : null}
            {directImportError ? <BodyStatusInset tone="danger">{directImportError}</BodyStatusInset> : null}
          </BodyInset>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="v3-import-csv-text">CSV 텍스트</label>
            <textarea
              className={bodyTextAreaClassName}
              id="v3-import-csv-text"
              onChange={(event) => {
                setCsvText(event.currentTarget.value);
                setSelectedFileName("");
                setApiError(null);
                setSavedBatch(null);
                setResult(null);
                setSavedDraftId("");
              }}
              placeholder="date,amount,description\n2026-01-01,1000,sample"
              value={csvText}
            />
          </div>
        </Card>

        <Card className="space-y-3">
          <BodySectionHeading
            action={inferred ? (
              <Button
                data-testid="v3-mapping-suggest-apply"
                onClick={() => {
                  setMapping(applyInferredMapping(inferred));
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                추천 매핑 적용
              </Button>
            ) : null}
            description="헤더를 기준으로 날짜, 금액, 설명 컬럼을 먼저 맞춘 뒤 파싱 미리보기로 오류를 줄입니다."
            title="추천 매핑"
          />

          {inferred ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={confidenceVariant(inferred.confidence.date)}>DATE {inferred.confidence.date.toUpperCase()}</Badge>
              <Badge variant={confidenceVariant(inferred.confidence.amount)}>AMOUNT {inferred.confidence.amount.toUpperCase()}</Badge>
              <Badge variant={confidenceVariant(inferred.confidence.desc)}>DESC {inferred.confidence.desc.toUpperCase()}</Badge>
            </div>
          ) : (
            <p className="text-sm text-slate-600">헤더를 읽으면 추천 매핑이 표시됩니다.</p>
          )}

          {inferred?.reasons && inferred.reasons.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
              {inferred.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              date
              <select
                className={bodyFieldClassName}
                data-testid="v3-mapping-date"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setMapping((prev) => ({ ...prev, dateKey: value }));
                }}
                value={mapping.dateKey}
              >
                <option value="">선택</option>
                {headers.map((header, index) => (
                  <option key={`date-${index}-${header}`} value={header}>{header}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-700">
              desc (선택)
              <select
                className={bodyFieldClassName}
                data-testid="v3-mapping-desc"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setMapping((prev) => ({ ...prev, descKey: value }));
                }}
                value={mapping.descKey}
              >
                <option value="">선택 안 함</option>
                {headers.map((header, index) => (
                  <option key={`desc-${index}-${header}`} value={header}>{header}</option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-700">금액 모드</legend>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
              <label className={bodyChoiceRowClassName}>
                <input
                  checked={mapping.amountMode === "amount"}
                  name="amount-mode"
                  onChange={() => {
                    setMapping((prev) => ({ ...prev, amountMode: "amount" }));
                  }}
                  type="radio"
                />
                금액 컬럼 1개
              </label>
              <label className={bodyChoiceRowClassName}>
                <input
                  checked={mapping.amountMode === "inout"}
                  name="amount-mode"
                  onChange={() => {
                    setMapping((prev) => ({ ...prev, amountMode: "inout" }));
                  }}
                  type="radio"
                />
                입금/출금 컬럼 2개
              </label>
            </div>

            <label className="text-sm font-semibold text-slate-700">
              amount
              <select
                className={bodyFieldClassName}
                data-testid="v3-mapping-amount"
                disabled={mapping.amountMode !== "amount"}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setMapping((prev) => ({ ...prev, amountKey: value }));
                }}
                value={mapping.amountKey}
              >
                <option value="">선택</option>
                {headers.map((header, index) => (
                  <option key={`amount-${index}-${header}`} value={header}>{header}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                inflow
                <select
                  className={bodyFieldClassName}
                  data-testid="v3-mapping-inflow"
                  disabled={mapping.amountMode !== "inout"}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMapping((prev) => ({ ...prev, inflowKey: value }));
                  }}
                  value={mapping.inflowKey}
                >
                  <option value="">선택</option>
                  {headers.map((header, index) => (
                    <option key={`inflow-${index}-${header}`} value={header}>{header}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                outflow
                <select
                  className={bodyFieldClassName}
                  data-testid="v3-mapping-outflow"
                  disabled={mapping.amountMode !== "inout"}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMapping((prev) => ({ ...prev, outflowKey: value }));
                  }}
                  value={mapping.outflowKey}
                >
                  <option value="">선택</option>
                  {headers.map((header, index) => (
                    <option key={`outflow-${index}-${header}`} value={header}>{header}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <BodyInset data-testid="v3-mapping-errors">
            {mappingErrors.length > 0 || previewValidationErrors.length > 0 ? (
              <BodyStatusInset tone="danger">
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {mappingErrors.map((error, index) => (
                    <li key={`local-${error.field}-${index}`}>{error.message}</li>
                  ))}
                  {previewValidationErrors.map((error, index) => (
                    <li key={`server-${error.field}-${index}`}>{error.message}</li>
                  ))}
                </ul>
              </BodyStatusInset>
            ) : (
              <BodyStatusInset tone="success">매핑 검증을 통과했습니다.</BodyStatusInset>
            )}
          </BodyInset>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="v3-mapping-apply"
              disabled={!canRunImport || submitting}
              onClick={() => {
                void handleImport();
              }}
              type="button"
              variant="primary"
            >
              {submitting ? "가져오는 중..." : "가져오기 실행"}
            </Button>
            <BodyActionLink href="/planning/v3/drafts">
              초안 목록
            </BodyActionLink>
          </div>
        </Card>

        <Card className="space-y-3">
          <BodySectionHeading
            action={previewLoading ? <span className="text-xs text-slate-500">갱신 중...</span> : null}
            title="미리보기"
          />

          <div className="text-sm text-slate-700" data-testid="v3-csv-preview-stats">
            {previewStats
              ? `총 ${previewStats.total}건 / 성공 ${previewStats.ok}건 / 실패 ${previewStats.failed}건${previewStats.inferredMonths ? ` / 추정 월 ${previewStats.inferredMonths}` : ""}`
              : "미리보기 데이터가 없습니다."}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              저장 계좌
              <select
                className={`${bodyCompactFieldClassName} min-w-52`}
                disabled={accountLoading || accounts.length < 1}
                onChange={(event) => {
                  setSelectedAccountId(event.currentTarget.value);
                }}
                value={selectedAccountId}
              >
                <option value="">선택</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.kind})
                  </option>
                ))}
              </select>
            </label>
            <BodyActionLink href="/planning/v3/accounts">
              계좌 관리
            </BodyActionLink>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="v3-import-save-batch"
              disabled={!canRunImport || !previewStats || previewStats.ok < 1 || saveBatchLoading || !selectedAccountId}
              onClick={() => {
                void handleSaveBatch();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {saveBatchLoading ? "배치 저장 중..." : "저장(배치 생성)"}
            </Button>
            {savedBatch ? (
              <p className="text-xs font-semibold text-emerald-700">
                batch: {savedBatch.id} / total {savedBatch.total} / ok {savedBatch.ok} / failed {savedBatch.failed}
              </p>
            ) : null}
            {savedBatch ? (
              <BodyActionLink href={`/planning/v3/transactions/batches/${encodeURIComponent(savedBatch.id)}`}>
                배치 상세 보기
              </BodyActionLink>
            ) : null}
            <BodyActionLink href="/planning/v3/transactions">
              배치 목록
            </BodyActionLink>
          </div>

          <BodyInset data-testid="v3-csv-preview-errors">
            {previewTopReasons.length > 0 ? (
              <BodyStatusInset tone="danger">
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {previewTopReasons.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </BodyStatusInset>
            ) : (
              <BodyEmptyState className="px-3 py-4" description="파싱 실패 상위 사유가 없으면 이 상태로 유지됩니다." title="실패 요약이 없습니다." />
            )}
          </BodyInset>

          {previewWarnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
              {previewWarnings.slice(0, 5).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <BodyTableFrame>
            <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-csv-preview-table">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">line</th>
                  <th className="px-3 py-2 text-left">date</th>
                  <th className="px-3 py-2 text-right">amount</th>
                  <th className="px-3 py-2 text-left">desc(masked)</th>
                  <th className="px-3 py-2 text-left">status</th>
                  <th className="px-3 py-2 text-left">reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.length > 0 ? previewRows.map((row, index) => (
                  <tr data-testid={`v3-csv-preview-row-${index}`} key={`preview-${row.line}-${index}`}>
                    <td className="px-3 py-2 text-slate-800">{row.line}</td>
                    <td className="px-3 py-2 text-slate-800">{row.dateIso ?? "-"}</td>
                    <td className="px-3 py-2 text-right text-slate-800">{typeof row.amountKrw === "number" ? formatKrw(row.amountKrw) : "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.descMasked ?? "-"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={row.ok ? "success" : "destructive"}>{row.ok ? "OK" : "FAIL"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.reason ?? "-"}</td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-3 py-2 text-slate-500" colSpan={6}>미리보기 행이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </BodyTableFrame>
        </Card>

        {apiError ? (
          <Card>
            <p className="text-sm font-semibold text-rose-700">{apiError.message}</p>
            {apiError.details.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-700">
                {apiError.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        ) : null}

        {result ? (
          <>
            <Card className="space-y-3">
              <BodySectionHeading
                description="가져온 행 수와 집계 월 수를 확인한 뒤 초안을 저장하거나 다음 단계로 이동할 수 있습니다."
                title="Import 결과"
              />
              <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <div><dt className="font-semibold">rows</dt><dd>{result.meta.rows.toLocaleString("ko-KR")}</dd></div>
                <div><dt className="font-semibold">months</dt><dd>{result.meta.months.toLocaleString("ko-KR")}</dd></div>
                <div><dt className="font-semibold">mapping</dt><dd>{result.mappingUsed ? "custom" : "auto/alias"}</dd></div>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  data-testid="v3-save-draft"
                  disabled={saveDraftLoading}
                  onClick={() => {
                    void handleSaveDraft();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {saveDraftLoading ? "저장 중..." : "초안 저장"}
                </Button>
                {savedDraftId ? (
                  <BodyActionLink href="/planning/v3/drafts">
                    초안 목록 보기
                  </BodyActionLink>
                ) : null}
              </div>
            </Card>

            <Card className="space-y-3">
              <BodySectionHeading
                description="월별 수입, 지출, 순유입을 먼저 확인해 초안 값이 과도하게 튀지 않는지 점검합니다."
                title="월별 Cashflow"
              />
              {result.cashflow.length > 0 ? (
                <BodyTableFrame>
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">YYYY-MM</th>
                        <th className="px-3 py-2 text-right">income</th>
                        <th className="px-3 py-2 text-right">expense</th>
                        <th className="px-3 py-2 text-right">net</th>
                        <th className="px-3 py-2 text-right">txCount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.cashflow.map((row) => (
                        <tr key={row.ym}>
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.ym}</td>
                          <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.incomeKrw)}</td>
                          <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.expenseKrw)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(row.netKrw)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{row.txCount.toLocaleString("ko-KR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </BodyTableFrame>
              ) : (
                <BodyEmptyState description="가져온 데이터에서 월별 집계가 만들어지지 않았습니다." title="월별 Cashflow가 없습니다." />
              )}
            </Card>

            <Card className="space-y-2">
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced: draftPatch JSON</summary>
                <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
                  {JSON.stringify(result.draftPatch, null, 2)}
                </pre>
              </details>
            </Card>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
