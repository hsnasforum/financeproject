"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";
import { type MonthlyCashflow } from "@/lib/planning/v3/domain/types";

type ImportSuccess = {
  ok: true;
  cashflow: MonthlyCashflow[];
  draftPatch: Record<string, unknown>;
  meta: {
    rows: number;
    months: number;
  };
};

type ImportFailure = {
  ok: false;
  error?: {
    code?: string;
    message?: string;
  };
};

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function parseImportSuccess(payload: unknown): ImportSuccess | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as {
    ok?: unknown;
    cashflow?: unknown;
    draftPatch?: unknown;
    meta?: unknown;
  };
  if (row.ok !== true) return null;
  if (!Array.isArray(row.cashflow)) return null;
  if (!row.meta || typeof row.meta !== "object") return null;
  const meta = row.meta as { rows?: unknown; months?: unknown };
  if (typeof meta.rows !== "number" || typeof meta.months !== "number") return null;
  if (!row.draftPatch || typeof row.draftPatch !== "object") return null;
  return {
    ok: true,
    cashflow: row.cashflow as MonthlyCashflow[],
    draftPatch: row.draftPatch as Record<string, unknown>,
    meta: {
      rows: meta.rows,
      months: meta.months,
    },
  };
}

export function PlanningV3ImportClient() {
  const [csvText, setCsvText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [result, setResult] = useState<ImportSuccess | null>(null);

  const draftPatchJson = useMemo(() => {
    if (!result) return "";
    return JSON.stringify(result.draftPatch, null, 2);
  }, [result]);

  async function handleFilePick(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      setCsvText(text);
      setNoticeMessage(`파일을 불러왔습니다 (${file.name}).`);
      setErrorMessage("");
    } catch {
      setErrorMessage("파일을 읽지 못했습니다.");
      setNoticeMessage("");
    }
  }

  async function handleImport() {
    if (!csvText.trim()) {
      setErrorMessage("CSV 본문을 입력해 주세요.");
      setNoticeMessage("");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setNoticeMessage("");
    setResult(null);

    try {
      const csrf = readDevCsrfToken();
      const response = await fetch("/api/planning/v3/import/csv", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "text/csv",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: csvText,
      });
      const payload = (await response.json().catch(() => null)) as ImportSuccess | ImportFailure | null;
      const parsed = parseImportSuccess(payload);
      if (!response.ok || !parsed) {
        setErrorMessage("가져오기 실패: CSV 형식을 확인해 주세요.");
        return;
      }

      setResult(parsed);
      setNoticeMessage("CSV 가져오기가 완료되었습니다.");
    } catch {
      setErrorMessage("가져오기 실패: CSV 형식을 확인해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyDraftPatch() {
    if (!draftPatchJson) return;
    try {
      await navigator.clipboard.writeText(draftPatchJson);
      setNoticeMessage("draftPatch JSON을 복사했습니다.");
      setErrorMessage("");
    } catch {
      setErrorMessage("클립보드 복사를 지원하지 않는 환경입니다.");
    }
  }

  function handleDownloadDraftPatch() {
    if (!draftPatchJson) return;
    const blob = new Blob([draftPatchJson], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "draftPatch.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <div className="space-y-5" data-testid="v3-import-root">
        <Card className="space-y-4">
          <h1 className="text-xl font-black text-slate-900">Planning v3 CSV 가져오기</h1>
          <p className="text-sm text-slate-600">
            로컬 CSV를 붙여넣거나 업로드해서 월별 현금흐름과 Profile 초안 patch를 생성합니다.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              CSV 파일 선택 (.csv)
              <input
                accept=".csv,text/csv,text/plain"
                className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                data-testid="v3-import-file-input"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  void handleFilePick(file);
                }}
                type="file"
              />
            </label>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            CSV 입력
            <textarea
              className="mt-2 h-64 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs"
              data-testid="v3-import-textarea"
              onChange={(event) => setCsvText(event.currentTarget.value)}
              placeholder={"date,amount,description\n2026-01-01,1000000,salary\n2026-01-15,-300000,rent"}
              spellCheck={false}
              value={csvText}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="v3-import-submit"
              disabled={isSubmitting}
              onClick={() => {
                void handleImport();
              }}
              type="button"
              variant="primary"
            >
              {isSubmitting ? "가져오는 중..." : "CSV 가져오기"}
            </Button>
            {noticeMessage ? <p className="text-sm font-semibold text-emerald-700" data-testid="v3-import-notice">{noticeMessage}</p> : null}
            {errorMessage ? <p className="text-sm font-semibold text-rose-700" data-testid="v3-import-error">{errorMessage}</p> : null}
          </div>
        </Card>

        {result ? (
          <Card className="space-y-4" data-testid="v3-import-result">
            <h2 className="text-lg font-black text-slate-900">결과</h2>
            <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <p data-testid="v3-import-meta-rows">rows: <span className="font-semibold text-slate-900">{result.meta.rows.toLocaleString("ko-KR")}</span></p>
              <p data-testid="v3-import-meta-months">months: <span className="font-semibold text-slate-900">{result.meta.months.toLocaleString("ko-KR")}</span></p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-import-cashflow-table">
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
                    <tr data-testid={`v3-import-cashflow-row-${row.ym}`} key={row.ym}>
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

            <details className="rounded-xl border border-slate-200 p-3" data-testid="v3-import-advanced">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced: draftPatch</summary>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button data-testid="v3-import-copy-draft" onClick={handleCopyDraftPatch} size="sm" type="button" variant="outline">JSON 복사</Button>
                  <Button data-testid="v3-import-download-draft" onClick={handleDownloadDraftPatch} size="sm" type="button" variant="outline">draftPatch.json 다운로드</Button>
                </div>
                <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100" data-testid="v3-import-draft-json">
                  {draftPatchJson}
                </pre>
              </div>
            </details>
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}
