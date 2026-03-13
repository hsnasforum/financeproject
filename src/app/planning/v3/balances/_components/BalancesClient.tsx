"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { reportHeroActionLinkClassName, ReportHeroCard, ReportHeroStatCard, ReportHeroStatGrid } from "@/components/ui/ReportTone";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";

type Account = {
  id: string;
  name: string;
  kind: "checking" | "saving" | "card" | "cash" | "other" | "bank" | "broker";
  currency: "KRW";
};

type BatchMeta = {
  id: string;
  createdAt: string;
  rowCount: number;
  ymMin?: string;
  ymMax?: string;
};

type MonthlyAccountBalance = {
  ym: string;
  accountId: string;
  openingKrw: number;
  netChangeKrw: number;
  closingKrw: number;
  transferKrw?: number;
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

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `&csrf=${encodeURIComponent(csrf)}`;
}

export function BalancesClient() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [batches, setBatches] = useState<BatchMeta[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [includeTransfers, setIncludeTransfers] = useState(false);
  const [rows, setRows] = useState<MonthlyAccountBalance[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const accountNameById = useMemo(
    () => new Map(accounts.map((row) => [row.id, row.name])),
    [accounts],
  );

  const loadBatchesAndAccounts = useCallback(async () => {
    try {
      const [accountsResponse, batchesResponse] = await Promise.all([
        fetch(`/api/planning/v3/accounts?csrf=${encodeURIComponent(readDevCsrfToken() ?? "")}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch(`/api/planning/v3/transactions/batches?limit=100${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);
      const accountsPayload = await accountsResponse.json().catch(() => null);
      const batchesPayload = await batchesResponse.json().catch(() => null);

      if (accountsResponse.ok && isRecord(accountsPayload) && accountsPayload.ok === true && Array.isArray(accountsPayload.items)) {
        setAccounts(
          accountsPayload.items
            .filter((item) => isRecord(item) && asString(item.id) && asString(item.name))
            .map((item) => ({
              id: asString(item.id),
              name: asString(item.name),
              kind: (asString(item.kind) as Account["kind"]) || "bank",
              currency: "KRW",
            })),
        );
      } else {
        setAccounts([]);
      }

      if (batchesResponse.ok && isRecord(batchesPayload) && batchesPayload.ok === true && Array.isArray(batchesPayload.data)) {
        const parsed = batchesPayload.data
          .filter((row) => isRecord(row) && asString(row.id))
          .map((row) => ({
            id: asString(row.id),
            createdAt: asString(row.createdAt),
            rowCount: asNumber(row.rowCount),
            ...(asString(row.ymMin) ? { ymMin: asString(row.ymMin) } : {}),
            ...(asString(row.ymMax) ? { ymMax: asString(row.ymMax) } : {}),
          }));
        setBatches(parsed);
        setSelectedBatchId((prev) => prev || parsed[0]?.id || "");
      } else {
        setBatches([]);
        setSelectedBatchId("");
      }
    } catch {
      setAccounts([]);
      setBatches([]);
      setSelectedBatchId("");
    }
  }, []);

  const loadBalances = useCallback(async () => {
    if (!selectedBatchId) {
      setRows([]);
      setWarnings([]);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(selectedBatchId)}&includeTransfers=${includeTransfers ? "1" : "0"}${buildCsrfQuery()}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !Array.isArray(payload.data)) {
        setRows([]);
        setWarnings([]);
        setMessage("월별 잔액을 불러오지 못했습니다.");
        return;
      }

      setRows(
        payload.data
          .filter((row) => isRecord(row) && asString(row.ym) && asString(row.accountId))
          .map((row) => ({
            ym: asString(row.ym),
            accountId: asString(row.accountId),
            openingKrw: asNumber(row.openingKrw),
            netChangeKrw: asNumber(row.netChangeKrw),
            closingKrw: asNumber(row.closingKrw),
            ...(Number.isFinite(Number(row.transferKrw)) ? { transferKrw: asNumber(row.transferKrw) } : {}),
          })),
      );
      setWarnings(
        Array.isArray(payload.warnings)
          ? payload.warnings.map((row) => asString(row)).filter((row) => row.length > 0)
          : [],
      );
    } catch {
      setRows([]);
      setWarnings([]);
      setMessage("월별 잔액을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [includeTransfers, selectedBatchId]);

  useEffect(() => {
    void loadBatchesAndAccounts();
  }, [loadBatchesAndAccounts]);

  useEffect(() => {
    void loadBalances();
  }, [loadBalances]);

  return (
    <PageShell>
      <div className="space-y-5">
        <ReportHeroCard
          kicker="Balance Timeline"
          title="월별 잔액 흐름을 같은 기준으로 확인합니다"
          description="거래 배치와 초기잔액을 연결해서 계좌별 opening, net, closing 변화를 월 단위 표로 확인합니다."
          action={(
            <>
              <Link className={reportHeroActionLinkClassName} href="/planning/v3/accounts">
                계좌 관리
              </Link>
              <Link className={reportHeroActionLinkClassName} href="/planning/v3/transactions/batches">
                배치 목록
              </Link>
            </>
          )}
        >
          <ReportHeroStatGrid>
            <ReportHeroStatCard label="계좌 수" value={`${accounts.length}개`} description="타임라인에 매핑 가능한 계좌" />
            <ReportHeroStatCard label="배치 수" value={`${batches.length}개`} description="조회 가능한 거래 배치" />
            <ReportHeroStatCard label="선택 배치" value={selectedBatchId || "-"} description="현재 계산 기준 배치" />
            <ReportHeroStatCard label="행 수" value={`${rows.length}개`} description={includeTransfers ? "transfer 포함 계산" : "transfer 제외 계산"} />
          </ReportHeroStatGrid>
          {message ? <p className="text-xs font-semibold text-rose-300">{message}</p> : null}
        </ReportHeroCard>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">조회 조건</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold text-slate-700">
              배치 선택
              <select
                className="ml-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                onChange={(event) => {
                  setSelectedBatchId(event.currentTarget.value);
                }}
                value={selectedBatchId}
              >
                <option value="">선택</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.id} ({batch.rowCount} rows{batch.ymMin && batch.ymMax ? ` / ${batch.ymMin}~${batch.ymMax}` : ""})
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                checked={includeTransfers}
                onChange={(event) => {
                  setIncludeTransfers(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              transfer 포함
            </label>
          </div>
        </Card>

        {warnings.length > 0 ? (
          <Card className="space-y-2 border-amber-200 bg-amber-50">
            <p className="text-sm font-semibold text-amber-900">주의</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </Card>
        ) : null}

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">월별 잔액 표</h2>
          {loading ? <p className="text-sm text-slate-600">불러오는 중...</p> : null}
          {!loading && rows.length < 1 ? <p className="text-sm text-slate-600">표시할 잔액 데이터가 없습니다.</p> : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-balance-table">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">월</th>
                    <th className="px-3 py-2 text-left">계좌</th>
                    <th className="px-3 py-2 text-right">opening</th>
                    <th className="px-3 py-2 text-right">net</th>
                    <th className="px-3 py-2 text-right">closing</th>
                    <th className="px-3 py-2 text-right">transfer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={`${row.ym}-${row.accountId}`}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.ym}</td>
                      <td className="px-3 py-2 text-slate-800">{accountNameById.get(row.accountId) ?? row.accountId}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.openingKrw)}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.netChangeKrw)}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.closingKrw)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.transferKrw ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
