"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { parseCsvText } from "@/lib/planning/v3/providers/csv/csvParse";
import { detectDelimiter } from "@/lib/planning/v3/providers/csv/detectDialect";
import { inferCsvMapping } from "@/lib/planning/v3/providers/csv/infer";
import {
  type CsvAmountSign,
  type CsvDelimiter,
  type CsvEncoding,
} from "@/lib/planning/v3/providers/csv/types";

type ImportState = "idle" | "loading" | "success" | "error";
type AmountMode = "single" | "inout";
type CsvEncodingMode = "auto" | CsvEncoding;
type CsvDelimiterMode = "auto" | CsvDelimiter;

type MonthlyCashflow = {
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount: number;
};

type ImportResponse = {
  ok: true;
  cashflow: MonthlyCashflow[];
  draftPatch: Record<string, unknown>;
  meta: {
    rows: number;
    months: number;
  };
  mappingUsed?: Record<string, unknown>;
};

type SaveDraftResponse = {
  ok: true;
  draft: {
    id: string;
    createdAt: string;
    source: "csv";
    meta: {
      rows: number;
      months: number;
    };
  };
};

type MappingForm = {
  dateKey: string;
  amountMode: AmountMode;
  amountKey: string;
  inflowKey: string;
  outflowKey: string;
  descKey: string;
  typeKey: string;
  amountSign: CsvAmountSign;
};

type ImportErrorInfo = {
  message: string;
  issues: string[];
};

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function isImportResponse(payload: unknown): payload is ImportResponse {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as {
    ok?: unknown;
    cashflow?: unknown;
    draftPatch?: unknown;
    meta?: unknown;
  };
  if (row.ok !== true) return false;
  if (!Array.isArray(row.cashflow)) return false;
  if (!row.draftPatch || typeof row.draftPatch !== "object") return false;
  if (!row.meta || typeof row.meta !== "object") return false;
  const meta = row.meta as { rows?: unknown; months?: unknown };
  return typeof meta.rows === "number" && typeof meta.months === "number";
}

function isSaveDraftResponse(payload: unknown): payload is SaveDraftResponse {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as { ok?: unknown; draft?: unknown };
  if (row.ok !== true) return false;
  if (!row.draft || typeof row.draft !== "object") return false;
  const draft = row.draft as {
    id?: unknown;
    createdAt?: unknown;
    source?: unknown;
    meta?: unknown;
  };
  if (typeof draft.id !== "string" || !draft.id.trim()) return false;
  if (typeof draft.createdAt !== "string" || !draft.createdAt.trim()) return false;
  if (draft.source !== "csv") return false;
  if (!draft.meta || typeof draft.meta !== "object") return false;
  const meta = draft.meta as { rows?: unknown; months?: unknown };
  return typeof meta.rows === "number" && typeof meta.months === "number";
}

function replacementCharRatio(text: string): number {
  if (!text) return 0;
  let replacements = 0;
  for (const char of text) {
    if (char === "\uFFFD") replacements += 1;
  }
  return replacements / text.length;
}

function decodeCsvBytes(
  bytes: Uint8Array,
  mode: CsvEncodingMode,
): { text: string; encoding: CsvEncoding } {
  if (mode === "utf-8" || mode === "euc-kr") {
    return {
      text: new TextDecoder(mode).decode(bytes),
      encoding: mode,
    };
  }

  let utf8StrictOk = true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    utf8StrictOk = false;
  }

  const utf8Text = new TextDecoder("utf-8").decode(bytes);
  const utf8Ratio = replacementCharRatio(utf8Text);

  let eucKrText = "";
  let eucKrRatio = Number.POSITIVE_INFINITY;
  try {
    eucKrText = new TextDecoder("euc-kr").decode(bytes);
    eucKrRatio = replacementCharRatio(eucKrText);
  } catch {
    eucKrText = "";
    eucKrRatio = Number.POSITIVE_INFINITY;
  }

  if (!utf8StrictOk || eucKrRatio + 0.001 < utf8Ratio) {
    if (eucKrRatio !== Number.POSITIVE_INFINITY) {
      return { text: eucKrText, encoding: "euc-kr" };
    }
  }

  return { text: utf8Text, encoding: "utf-8" };
}

function parseImportError(payload: unknown): ImportErrorInfo {
  const defaultMessage = "가져오기 실패: 컬럼 매핑/CSV 형식을 확인해 주세요.";
  if (!payload || typeof payload !== "object") {
    return { message: defaultMessage, issues: [] };
  }

  const row = payload as {
    error?: {
      message?: unknown;
      issues?: unknown;
    };
  };

  const message = typeof row.error?.message === "string" && row.error.message.trim().length > 0
    ? row.error.message.trim()
    : defaultMessage;
  const issues = Array.isArray(row.error?.issues)
    ? row.error.issues
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 10)
    : [];

  return { message, issues };
}

export function ImportCsvClient() {
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [state, setState] = useState<ImportState>("idle");
  const [saveState, setSaveState] = useState<ImportState>("idle");
  const [message, setMessage] = useState("");
  const [errorIssues, setErrorIssues] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [savedDraftId, setSavedDraftId] = useState("");
  const [encodingMode, setEncodingMode] = useState<CsvEncodingMode>("auto");
  const [decodedEncoding, setDecodedEncoding] = useState<CsvEncoding>("utf-8");
  const [delimiterMode, setDelimiterMode] = useState<CsvDelimiterMode>("auto");
  const [uploadedFileBytes, setUploadedFileBytes] = useState<Uint8Array | null>(null);
  const [mapping, setMapping] = useState<MappingForm>({
    dateKey: "",
    amountMode: "single",
    amountKey: "",
    inflowKey: "",
    outflowKey: "",
    descKey: "",
    typeKey: "",
    amountSign: "signed",
  });

  const mappingReady = useMemo(() => {
    const hasDate = mapping.dateKey.trim().length > 0;
    if (!hasDate) return false;
    if (mapping.amountMode === "single") {
      return mapping.amountKey.trim().length > 0;
    }
    return mapping.inflowKey.trim().length > 0 && mapping.outflowKey.trim().length > 0;
  }, [mapping]);

  const draftPatchJson = useMemo(
    () => (result ? JSON.stringify(result.draftPatch, null, 2) : ""),
    [result],
  );

  useEffect(() => {
    if (!uploadedFileBytes) return;
    try {
      const decoded = decodeCsvBytes(uploadedFileBytes, encodingMode);
      setCsvText(decoded.text);
      setDecodedEncoding(decoded.encoding);
      setHeaders([]);
      setPreviewRows([]);
      setResult(null);
      setSaveState("idle");
      setSavedDraftId("");
      setState("idle");
      setErrorIssues([]);
      setMessage(`CSV 파일을 불러왔습니다. (${decoded.encoding})`);
    } catch {
      setState("error");
      setErrorIssues([]);
      setMessage("파일을 읽지 못했습니다.");
    }
  }, [uploadedFileBytes, encodingMode]);

  async function handleFileSelect(file: File | null) {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      setUploadedFileBytes(new Uint8Array(buffer));
    } catch {
      setState("error");
      setErrorIssues([]);
      setMessage("파일을 읽지 못했습니다.");
    }
  }

  function prepareMappingStep() {
    const payload = csvText.trim();
    if (!payload) {
      setState("error");
      setErrorIssues([]);
      setMessage("CSV를 입력해 주세요.");
      return;
    }

    const effectiveDelimiter = delimiterMode === "auto"
      ? detectDelimiter(payload)
      : delimiterMode;

    const parsed = parseCsvText(payload, {
      hasHeader: true,
      delimiter: effectiveDelimiter,
    });
    const nextHeaders = parsed.header ?? [];
    if (nextHeaders.length < 1) {
      setState("error");
      setErrorIssues([]);
      setMessage("CSV 헤더를 찾지 못했습니다.");
      return;
    }

    const inferred = inferCsvMapping(payload, { delimiter: effectiveDelimiter });
    const amountMode: AmountMode = inferred.suggestions.amountKey
      ? "single"
      : (inferred.suggestions.inflowKey && inferred.suggestions.outflowKey ? "inout" : "single");

    setHeaders(nextHeaders);
    setPreviewRows(parsed.rows.slice(0, 5));
    setMapping({
      dateKey: inferred.suggestions.dateKey ?? "",
      amountMode,
      amountKey: inferred.suggestions.amountKey ?? "",
      inflowKey: inferred.suggestions.inflowKey ?? "",
      outflowKey: inferred.suggestions.outflowKey ?? "",
      descKey: inferred.suggestions.descKey ?? "",
      typeKey: inferred.suggestions.typeKey ?? "",
      amountSign: inferred.suggestions.amountSign ?? "signed",
    });
    setResult(null);
    setSaveState("idle");
    setSavedDraftId("");
    setState("idle");
    setErrorIssues([]);
    setMessage("컬럼 매핑을 확인한 뒤 가져오기를 실행하세요.");
  }

  async function submitCsvWithMapping() {
    const payload = csvText.trim();
    if (!payload) {
      setState("error");
      setErrorIssues([]);
      setMessage("CSV를 입력해 주세요.");
      return;
    }
    if (!mappingReady) {
      setState("error");
      setErrorIssues([]);
      setMessage(mapping.amountMode === "single"
        ? "date/amount 컬럼을 선택해 주세요."
        : "date/inflow/outflow 컬럼을 선택해 주세요.");
      return;
    }

    setState("loading");
    setResult(null);
    setSaveState("idle");
    setSavedDraftId("");
    setErrorIssues([]);
    setMessage("");

    const mappingPayload = {
      dateKey: mapping.dateKey,
      ...(mapping.amountMode === "single"
        ? {
          amountKey: mapping.amountKey,
          amountSign: mapping.amountSign,
        }
        : {
          inflowKey: mapping.inflowKey,
          outflowKey: mapping.outflowKey,
        }),
      ...(mapping.descKey ? { descKey: mapping.descKey } : {}),
      ...(mapping.typeKey ? { typeKey: mapping.typeKey } : {}),
      ...(delimiterMode !== "auto" ? { delimiter: delimiterMode } : {}),
      ...(encodingMode !== "auto" ? { encoding: encodingMode } : {}),
    };

    try {
      const response = await fetch("/api/planning/v3/import/csv", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          csvText: payload,
          mapping: mappingPayload,
        })),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isImportResponse(json)) {
        const error = parseImportError(json);
        setState("error");
        setErrorIssues(error.issues);
        setMessage(error.message);
        return;
      }
      setResult(json);
      setState("success");
      setErrorIssues([]);
      setMessage("CSV 가져오기 완료");
    } catch {
      setState("error");
      setErrorIssues([]);
      setMessage("가져오기 실패: 컬럼 매핑/CSV 형식을 확인해 주세요.");
    }
  }

  async function saveDraft() {
    if (!result) return;

    setSaveState("loading");
    setSavedDraftId("");
    setMessage("");

    try {
      const response = await fetch("/api/planning/v3/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          cashflow: result.cashflow,
          draftPatch: result.draftPatch,
          meta: result.meta,
        })),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isSaveDraftResponse(json)) {
        setSaveState("error");
        setMessage("초안 저장에 실패했습니다.");
        return;
      }
      setSaveState("success");
      setSavedDraftId(json.draft.id);
      setMessage("초안을 저장했습니다.");
    } catch {
      setSaveState("error");
      setMessage("초안 저장에 실패했습니다.");
    }
  }

  async function copyDraftPatch() {
    if (!draftPatchJson) return;
    try {
      await navigator.clipboard.writeText(draftPatchJson);
      setMessage("draftPatch JSON을 복사했습니다.");
    } catch {
      setState("error");
      setErrorIssues([]);
      setMessage("복사에 실패했습니다.");
    }
  }

  function downloadDraftPatch() {
    if (!draftPatchJson) return;
    const blob = new Blob([draftPatchJson], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "draftPatch.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const csvStatus = uploadedFileBytes
    ? `file (${decodedEncoding})`
    : "text";

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-4">
          <h1 className="text-xl font-black text-slate-900">Planning v3 CSV Import</h1>
          <p className="text-sm text-slate-600">
            1) CSV 입력/업로드 → 2) 컬럼 매핑 선택 → 3) 월별 cashflow/draftPatch 확인
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              파일 인코딩
              <select
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                data-testid="v3-csv-encoding"
                onChange={(event) => {
                  const value = event.currentTarget.value as CsvEncodingMode;
                  setEncodingMode(value);
                }}
                value={encodingMode}
              >
                <option value="auto">auto</option>
                <option value="utf-8">utf-8</option>
                <option value="euc-kr">euc-kr</option>
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              CSV 구분자
              <select
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                data-testid="v3-csv-delimiter"
                onChange={(event) => {
                  const value = event.currentTarget.value as CsvDelimiterMode;
                  setDelimiterMode(value);
                  if (headers.length > 0) {
                    setHeaders([]);
                    setPreviewRows([]);
                    setResult(null);
                    setSaveState("idle");
                    setSavedDraftId("");
                    setState("idle");
                    setErrorIssues([]);
                    setMessage("구분자가 변경되어 매핑 단계를 초기화했습니다.");
                  }
                }}
                value={delimiterMode}
              >
                <option value="auto">auto</option>
                <option value=",">comma (,)</option>
                <option value={"\t"}>tab (\t)</option>
                <option value=";">semicolon (;)</option>
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold text-slate-700">
            CSV 붙여넣기
            <textarea
              className="mt-2 h-64 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs"
              data-testid="v3-csv-text"
              onChange={(event) => {
                setUploadedFileBytes(null);
                setCsvText(event.currentTarget.value);
                setHeaders([]);
                setPreviewRows([]);
                setResult(null);
                setSaveState("idle");
                setSavedDraftId("");
                setState("idle");
                setErrorIssues([]);
                setMessage("");
              }}
              placeholder={"date,amount,desc\n2026-01-01,1200000,salary\n2026-01-10,-300000,rent"}
              spellCheck={false}
              value={csvText}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            CSV 파일 업로드
            <input
              accept=".csv,text/csv"
              className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              data-testid="v3-csv-file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                void handleFileSelect(file);
              }}
              type="file"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              data-testid="v3-csv-submit"
              onClick={prepareMappingStep}
              type="button"
              variant="primary"
            >
              다음: 컬럼 매핑
            </Button>
            <span className="text-sm text-slate-600" data-testid="v3-import-state">{state}</span>
            <span className="text-xs text-slate-500">source: {csvStatus}</span>
            {message && state !== "error" ? (
              <span className="text-sm font-semibold text-emerald-700">{message}</span>
            ) : null}
          </div>

          {state === "error" ? (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
              data-testid="v3-import-error"
            >
              <p className="font-semibold">{message || "가져오기에 실패했습니다."}</p>
              {errorIssues.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {errorIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Card>

        {headers.length > 0 ? (
          <Card className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Step 2. 컬럼 매핑 + 미리보기</h2>

            <div className="overflow-x-auto rounded-xl border border-slate-200" data-testid="v3-csv-preview">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {headers.map((header, index) => (
                      <th key={`preview-header-${index + 1}`} className="px-2 py-2 text-left font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {previewRows.length > 0 ? previewRows.map((row, index) => (
                    <tr key={`preview-row-${index + 1}`}>
                      {headers.map((header, headerIndex) => (
                        <td
                          key={`preview-row-${index + 1}-${headerIndex + 1}`}
                          className="px-2 py-2 font-mono"
                        >
                          {row[headerIndex] ?? ""}
                        </td>
                      ))}
                    </tr>
                  )) : (
                    <tr>
                      <td className="px-2 py-3 text-slate-500" colSpan={headers.length}>미리보기 행이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                date (필수)
                <select
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  data-testid="v3-mapping-date"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMapping((prev) => ({ ...prev, dateKey: value }));
                  }}
                  value={mapping.dateKey}
                >
                  <option value="">선택</option>
                  {headers.map((header) => (
                    <option key={`date-${header}`} value={header}>{header}</option>
                  ))}
                </select>
              </label>

              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-sm font-semibold text-slate-700">금액 모드 (필수)</p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      checked={mapping.amountMode === "single"}
                      data-testid="v3-mapping-mode-single"
                      name="amount-mode"
                      onChange={() => {
                        setMapping((prev) => ({ ...prev, amountMode: "single" }));
                      }}
                      type="radio"
                      value="single"
                    />
                    금액 컬럼 1개
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      checked={mapping.amountMode === "inout"}
                      data-testid="v3-mapping-mode-inout"
                      name="amount-mode"
                      onChange={() => {
                        setMapping((prev) => ({ ...prev, amountMode: "inout" }));
                      }}
                      type="radio"
                      value="inout"
                    />
                    입금/출금 컬럼 2개
                  </label>
                </div>
              </div>

              {mapping.amountMode === "single" ? (
                <>
                  <label className="text-sm font-semibold text-slate-700">
                    amount (필수)
                    <select
                      className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      data-testid="v3-mapping-amount"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setMapping((prev) => ({ ...prev, amountKey: value }));
                      }}
                      value={mapping.amountKey}
                    >
                      <option value="">선택</option>
                      {headers.map((header) => (
                        <option key={`amount-${header}`} value={header}>{header}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-semibold text-slate-700">
                    amount sign
                    <select
                      className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      data-testid="v3-mapping-sign"
                      onChange={(event) => {
                        const value = event.currentTarget.value as CsvAmountSign;
                        setMapping((prev) => ({ ...prev, amountSign: value }));
                      }}
                      value={mapping.amountSign}
                    >
                      <option value="signed">signed</option>
                      <option value="inflowPositive">inflowPositive</option>
                      <option value="outflowPositive">outflowPositive</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className="text-sm font-semibold text-slate-700">
                    inflow (필수)
                    <select
                      className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      data-testid="v3-mapping-inflow"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setMapping((prev) => ({ ...prev, inflowKey: value }));
                      }}
                      value={mapping.inflowKey}
                    >
                      <option value="">선택</option>
                      {headers.map((header) => (
                        <option key={`inflow-${header}`} value={header}>{header}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-semibold text-slate-700">
                    outflow (필수)
                    <select
                      className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      data-testid="v3-mapping-outflow"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setMapping((prev) => ({ ...prev, outflowKey: value }));
                      }}
                      value={mapping.outflowKey}
                    >
                      <option value="">선택</option>
                      {headers.map((header) => (
                        <option key={`outflow-${header}`} value={header}>{header}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <label className="text-sm font-semibold text-slate-700">
                desc (선택)
                <select
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  data-testid="v3-mapping-desc"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMapping((prev) => ({ ...prev, descKey: value }));
                  }}
                  value={mapping.descKey}
                >
                  <option value="">선택 안함</option>
                  {headers.map((header) => (
                    <option key={`desc-${header}`} value={header}>{header}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                type (선택)
                <select
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMapping((prev) => ({ ...prev, typeKey: value }));
                  }}
                  value={mapping.typeKey}
                >
                  <option value="">선택 안함</option>
                  {headers.map((header) => (
                    <option key={`type-${header}`} value={header}>{header}</option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <Button
                data-testid="v3-mapping-apply"
                disabled={state === "loading" || !mappingReady}
                onClick={() => {
                  void submitCsvWithMapping();
                }}
                type="button"
                variant="primary"
              >
                {state === "loading" ? "가져오는 중..." : "매핑 적용 후 가져오기"}
              </Button>
            </div>
          </Card>
        ) : null}

        {result ? (
          <Card className="space-y-4">
            <div className="text-sm text-slate-700" data-testid="v3-import-meta">
              rows: <span className="font-semibold text-slate-900">{result.meta.rows.toLocaleString("ko-KR")}</span>
              {" · "}
              months: <span className="font-semibold text-slate-900">{result.meta.months.toLocaleString("ko-KR")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                data-testid="v3-save-draft"
                disabled={saveState === "loading"}
                onClick={() => {
                  void saveDraft();
                }}
                type="button"
                variant="primary"
              >
                {saveState === "loading" ? "저장 중..." : "초안 저장"}
              </Button>
              {saveState === "success" && savedDraftId ? (
                <Link
                  className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                  href="/planning/v3/drafts"
                >
                  초안 목록 보기
                </Link>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-cashflow-table">
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
            </div>

            <details className="rounded-xl border border-slate-200 p-3" data-testid="v3-advanced-toggle">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced</summary>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button onClick={copyDraftPatch} size="sm" type="button" variant="outline">JSON 복사</Button>
                <Button onClick={downloadDraftPatch} size="sm" type="button" variant="outline">draftPatch.json 다운로드</Button>
              </div>
              <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                {draftPatchJson}
              </pre>
            </details>
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}
