"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";

type DraftDetail = {
  id: string;
  createdAt: string;
  source: {
    kind: "csv";
    filename?: string;
    rows?: number;
    months?: number;
  };
  summary: {
    medianIncomeKrw?: number;
    medianExpenseKrw?: number;
    avgNetKrw?: number;
    notes?: string[];
  };
  cashflow: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>;
  draftPatch: Record<string, unknown>;
};

type DraftDetailResponse = {
  ok: true;
  draft: DraftDetail;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDraftDetail(payload: unknown): payload is DraftDetail {
  if (!isRecord(payload)) return false;
  if (!asString(payload.id) || !asString(payload.createdAt)) return false;
  if (!isRecord(payload.source) || payload.source.kind !== "csv") return false;
  if (!isRecord(payload.summary) || !Array.isArray(payload.cashflow) || !isRecord(payload.draftPatch)) return false;
  return true;
}

function isDraftDetailResponse(payload: unknown): payload is DraftDetailResponse {
  if (!isRecord(payload)) return false;
  if (payload.ok !== true) return false;
  return isDraftDetail(payload.draft);
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function exportProfileV2(draftId: string): void {
  const anchor = document.createElement("a");
  anchor.href = `/api/planning/v3/drafts/${encodeURIComponent(draftId)}/export/profile-v2${buildCsrfQuery()}`;
  anchor.download = "profile-v2-draft.json";
  anchor.click();
}

export function DraftDetailClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<DraftDetail | null>(null);

  useEffect(() => {
    let disposed = false;

    async function load() {
      setLoading(true);
      setMessage("");

      try {
        const response = await fetch(`/api/planning/v3/drafts/${encodeURIComponent(id)}${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !isDraftDetailResponse(json)) {
          if (!disposed) {
            setDraft(null);
            setMessage("초안 상세를 불러오지 못했습니다.");
          }
          return;
        }

        if (!disposed) {
          setDraft(json.draft);
        }
      } catch {
        if (!disposed) {
          setDraft(null);
          setMessage("초안 상세를 불러오지 못했습니다.");
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      disposed = true;
    };
  }, [id]);

  return (
    <PageShell>
      <div className="space-y-5" data-testid="v3-draft-detail">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Draft Detail</h1>
          <div className="text-sm text-slate-600">id: <span className="font-mono">{id}</span></div>
          <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/drafts">
            목록으로 돌아가기
          </Link>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">초안을 불러오는 중...</p>
          </Card>
        ) : null}

        {draft ? (
          <>
            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Summary</h2>
              <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <div><dt className="font-semibold">createdAt</dt><dd>{formatDateTime(draft.createdAt)}</dd></div>
                <div><dt className="font-semibold">months</dt><dd>{draft.source.months ?? "-"}</dd></div>
                <div><dt className="font-semibold">rows</dt><dd>{draft.source.rows ?? "-"}</dd></div>
                <div><dt className="font-semibold">medianIncome</dt><dd>{formatKrw(asNumber(draft.summary.medianIncomeKrw))}</dd></div>
                <div><dt className="font-semibold">medianExpense</dt><dd>{formatKrw(asNumber(draft.summary.medianExpenseKrw))}</dd></div>
                <div><dt className="font-semibold">avgNet</dt><dd>{formatKrw(asNumber(draft.summary.avgNetKrw))}</dd></div>
              </dl>
              <div className="pt-1">
                <Button
                  data-testid="v3-export-profilev2"
                  onClick={() => {
                    exportProfileV2(draft.id);
                  }}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  ProfileV2 초안 다운로드
                </Button>
              </div>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Cashflow</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                    {draft.cashflow.map((row) => (
                      <tr key={row.ym}>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.ym}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.incomeKrw))}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.expenseKrw))}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(asNumber(row.netKrw))}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.txCount).toLocaleString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
