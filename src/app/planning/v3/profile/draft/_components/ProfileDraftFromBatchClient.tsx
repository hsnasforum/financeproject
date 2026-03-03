"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";

type DraftPatchResponse = {
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
  assumptions: string[];
  monthsConsidered: number;
};

type DraftEvidenceResponse = {
  monthsUsed: string[];
  ymStats: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    fixedExpenseKrw: number;
    variableExpenseKrw: number;
    debtExpenseKrw: number;
    transferKrw: number;
  }>;
  byCategoryStats: Array<{
    categoryId: string;
    totalKrw: number;
  }>;
  medians: {
    incomeKrw: number;
    expenseKrw: number;
    fixedExpenseKrw: number;
    variableExpenseKrw: number;
    debtExpenseKrw: number;
  };
  ruleCoverage: {
    total: number;
    override: number;
    rule: number;
    default: number;
    transfer: number;
  };
};

type DraftApiPayload = {
  ok: true;
  meta: {
    batchId: string;
  };
  data: {
    draftPatch: DraftPatchResponse;
    evidence: DraftEvidenceResponse;
    assumptions: string[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function isDraftPayload(value: unknown): value is DraftApiPayload {
  if (!isRecord(value) || value.ok !== true) return false;
  if (!isRecord(value.meta) || !asString(value.meta.batchId)) return false;
  if (!isRecord(value.data) || !isRecord(value.data.draftPatch) || !isRecord(value.data.evidence)) return false;
  return true;
}

function sanitizeFileNameToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "batch";
}

type Props = {
  initialBatchId?: string;
};

export function ProfileDraftFromBatchClient({ initialBatchId = "" }: Props) {
  const [batchId, setBatchId] = useState(initialBatchId);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<DraftApiPayload | null>(null);

  const summary = useMemo(() => {
    if (!result) return null;
    return {
      incomeKrw: asNumber(result.data.evidence.medians.incomeKrw),
      expenseKrw: asNumber(result.data.evidence.medians.expenseKrw),
      fixedKrw: asNumber(result.data.evidence.medians.fixedExpenseKrw),
      variableKrw: asNumber(result.data.evidence.medians.variableExpenseKrw),
    };
  }, [result]);

  async function handleGenerate() {
    const safeBatchId = asString(batchId);
    if (!safeBatchId || loading) return;

    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ batchId: safeBatchId });
      const csrf = withDevCsrf({}).csrf;
      if (asString(csrf)) {
        params.set("csrf", asString(csrf));
      }
      const url = `/api/planning/v3/profile/draft?${params.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isDraftPayload(payload)) {
        const errorMessage = isRecord(payload) && isRecord(payload.error)
          ? asString(payload.error.message)
          : "";
        setResult(null);
        setMessage(errorMessage || "초안 생성에 실패했습니다.");
        return;
      }
      setResult(payload);
    } catch {
      setResult(null);
      setMessage("초안 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    const payload = {
      batchId: result.meta.batchId,
      draftPatch: result.data.draftPatch,
      evidence: result.data.evidence,
      assumptions: result.data.assumptions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `profile-v2-draft-${sanitizeFileNameToken(result.meta.batchId)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Draft Patch From Batch</h1>
          <p className="text-sm font-semibold text-amber-700">이 초안은 저장/적용되지 않으며 다운로드만 제공합니다.</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="v3-draft-batch-id">
              batchId
            </label>
            <input
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm sm:w-96"
              id="v3-draft-batch-id"
              onChange={(event) => {
                setBatchId(event.target.value);
              }}
              placeholder="batch id"
              value={batchId}
            />
            <Button
              disabled={loading || asString(batchId).length < 1}
              onClick={() => {
                void handleGenerate();
              }}
              size="sm"
              type="button"
            >
              {loading ? "생성 중..." : "초안 생성"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-emerald-700">
            <Link className="underline underline-offset-2" href="/planning/v3/profile/drafts">
              저장된 profile drafts
            </Link>
            <Link className="underline underline-offset-2" href="/planning/v3/transactions/batches">
              배치 목록
            </Link>
            <Link className="underline underline-offset-2" href="/planning/v3/drafts/profile">
              기존 draft 생성 화면
            </Link>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        {summary ? (
          <Card className="space-y-3" data-testid="v3-draft-summary">
            <h2 className="text-sm font-bold text-slate-900">요약 (transfer 제외)</h2>
            <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <dt className="font-semibold">월 소득 (median)</dt>
                <dd>{formatKrw(summary.incomeKrw)}</dd>
              </div>
              <div>
                <dt className="font-semibold">월 지출 (median)</dt>
                <dd>{formatKrw(summary.expenseKrw)}</dd>
              </div>
              <div>
                <dt className="font-semibold">월 필수지출 (median)</dt>
                <dd>{formatKrw(summary.fixedKrw)}</dd>
              </div>
              <div>
                <dt className="font-semibold">월 변동지출 (median)</dt>
                <dd>{formatKrw(summary.variableKrw)}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                data-testid="v3-draft-download"
                onClick={handleDownload}
                size="sm"
                type="button"
              >
                초안 JSON 다운로드
              </Button>
              <span className="text-xs text-slate-500">
                {result?.meta.batchId ? `batchId: ${result.meta.batchId}` : ""}
              </span>
            </div>
          </Card>
        ) : null}

        {result ? (
          <Card className="space-y-3">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Evidence 요약</summary>
              <div className="mt-3 space-y-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs text-slate-700">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-2 py-1 text-left">month</th>
                        <th className="px-2 py-1 text-right">income</th>
                        <th className="px-2 py-1 text-right">expense</th>
                        <th className="px-2 py-1 text-right">fixed</th>
                        <th className="px-2 py-1 text-right">variable</th>
                        <th className="px-2 py-1 text-right">transfer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.evidence.ymStats.map((row) => (
                        <tr className="border-b border-slate-100" key={row.ym}>
                          <td className="px-2 py-1">{row.ym}</td>
                          <td className="px-2 py-1 text-right">{formatKrw(row.incomeKrw)}</td>
                          <td className="px-2 py-1 text-right">{formatKrw(row.expenseKrw)}</td>
                          <td className="px-2 py-1 text-right">{formatKrw(row.fixedExpenseKrw)}</td>
                          <td className="px-2 py-1 text-right">{formatKrw(row.variableExpenseKrw)}</td>
                          <td className="px-2 py-1 text-right">{formatKrw(row.transferKrw)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-slate-600">
                  rule coverage: override {result.data.evidence.ruleCoverage.override} /
                  rule {result.data.evidence.ruleCoverage.rule} /
                  default {result.data.evidence.ruleCoverage.default} /
                  transfer {result.data.evidence.ruleCoverage.transfer}
                </p>
              </div>
            </details>
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}
