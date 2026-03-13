"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BodyActionLink, bodyActionLinkGroupClassName, BodyEmptyState, BodySectionHeading, BodyTableFrame, bodyDenseActionRowClassName } from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type BatchSummary = {
  batchId: string;
  createdAt?: string;
  range?: {
    fromYm?: string;
    toYm?: string;
    months?: number;
  };
  counts: {
    txns: number;
    transfers: number;
    unassignedCategory: number;
  };
  totals: {
    incomeKrw: number;
    expenseKrw: number;
    transferKrw: number;
  };
  topExpenseCategories: Array<{ categoryId: string; totalKrw: number }>;
  monthly: Array<{ ym: string; incomeKrw: number; expenseKrw: number; transferKrw: number }>;
};

type SummaryResponse = {
  ok: true;
  data: BatchSummary;
};

type DraftCreateResponse = {
  ok: true;
  data: {
    id: string;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSummaryResponse(value: unknown): value is SummaryResponse {
  return isRecord(value) && value.ok === true && isRecord(value.data) && Array.isArray(value.data.monthly);
}

function isDraftCreateResponse(value: unknown): value is DraftCreateResponse {
  return isRecord(value) && value.ok === true && isRecord(value.data) && asString(value.data.id).length > 0;
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function formatKrw(value: unknown): string {
  return `${asNumber(value).toLocaleString("ko-KR")}원`;
}

type Props = {
  id: string;
  initialSummary?: BatchSummary | null;
};

export function BatchSummaryClient({ id, initialSummary = null }: Props) {
  const [loading, setLoading] = useState(initialSummary === null);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<BatchSummary | null>(initialSummary);
  const [createLoading, setCreateLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/batches/${encodeURIComponent(id)}/summary${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isSummaryResponse(json)) {
        setSummary(null);
        setMessage("배치 요약을 불러오지 못했습니다.");
        return;
      }
      setSummary(json.data);
    } catch {
      setSummary(null);
      setMessage("배치 요약을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  async function handleCreateDraft(): Promise<void> {
    if (!summary || createLoading) return;
    setCreateLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/planning/v3/profile/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({ batchId: summary.batchId })),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isDraftCreateResponse(json)) {
        setMessage("초안 생성에 실패했습니다.");
        return;
      }
      window.location.href = `/planning/v3/profile/drafts/${encodeURIComponent(json.data.id)}`;
    } catch {
      setMessage("초안 생성에 실패했습니다.");
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Batch Summary</h1>
          <div className={bodyActionLinkGroupClassName}>
            <BodyActionLink href="/planning/v3/batches">
              배치 목록
            </BodyActionLink>
            <BodyActionLink href="/planning/v3/profile/drafts">
              Draft 목록
            </BodyActionLink>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        <Card className="space-y-3" data-testid="v3-batch-summary">
          {loading ? <p className="text-sm text-slate-600">요약을 불러오는 중...</p> : null}
          {summary ? (
            <>
              <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  <dt className="font-semibold">batchId</dt>
                  <dd className="font-mono text-xs">{summary.batchId}</dd>
                </div>
                <div>
                  <dt className="font-semibold">createdAt</dt>
                  <dd className="text-xs">{summary.createdAt ? formatDateTime(summary.createdAt) : "-"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">range</dt>
                  <dd>{summary.range?.fromYm ?? "-"} ~ {summary.range?.toYm ?? "-"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">months</dt>
                  <dd>{asNumber(summary.range?.months ?? 0)}</dd>
                </div>
                <div>
                  <dt className="font-semibold">txns</dt>
                  <dd>{asNumber(summary.counts.txns)}</dd>
                </div>
                <div>
                  <dt className="font-semibold">transfers</dt>
                  <dd>{asNumber(summary.counts.transfers)}</dd>
                </div>
                <div>
                  <dt className="font-semibold">unassignedCategory</dt>
                  <dd>{asNumber(summary.counts.unassignedCategory)}</dd>
                </div>
                <div>
                  <dt className="font-semibold">income / expense / transfer</dt>
                  <dd>{formatKrw(summary.totals.incomeKrw)} / {formatKrw(summary.totals.expenseKrw)} / {formatKrw(summary.totals.transferKrw)}</dd>
                </div>
              </dl>
              <div className={bodyDenseActionRowClassName}>
                <Button
                  data-testid="v3-batch-create-draft"
                  disabled={createLoading}
                  onClick={() => {
                    void handleCreateDraft();
                  }}
                  size="sm"
                  type="button"
                >
                  {createLoading ? "생성 중..." : "이 배치로 초안 생성"}
                </Button>
                <Button onClick={() => { void loadSummary(); }} size="sm" type="button" variant="outline">
                  새로고침
                </Button>
              </div>
            </>
          ) : null}
        </Card>

        {summary ? (
          <Card className="space-y-3">
            <BodySectionHeading title="월별 요약" />
            <BodyTableFrame>
              <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-1 text-left">ym</th>
                    <th className="px-2 py-1 text-right">income</th>
                    <th className="px-2 py-1 text-right">expense</th>
                    <th className="px-2 py-1 text-right">transfer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.monthly.map((row) => (
                    <tr key={row.ym}>
                      <td className="px-2 py-1">{row.ym}</td>
                      <td className="px-2 py-1 text-right">{formatKrw(row.incomeKrw)}</td>
                      <td className="px-2 py-1 text-right">{formatKrw(row.expenseKrw)}</td>
                      <td className="px-2 py-1 text-right">{formatKrw(row.transferKrw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BodyTableFrame>
          </Card>
        ) : null}

        {summary ? (
          <Card className="space-y-2">
            <BodySectionHeading title="Top Expense Categories" />
            <ul className="space-y-1 text-sm text-slate-700">
              {summary.topExpenseCategories.map((row) => (
                <li key={row.categoryId} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1">
                  <span>{row.categoryId}</span>
                  <span className="font-semibold">{formatKrw(row.totalKrw)}</span>
                </li>
              ))}
              {summary.topExpenseCategories.length < 1 ? (
                <li><BodyEmptyState className="px-3 py-4" description="아직 지출 카테고리 합계가 계산되지 않았습니다." title="지출 카테고리 데이터가 없습니다." /></li>
              ) : null}
            </ul>
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}
