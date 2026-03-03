"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";

type Account = {
  id: string;
  name: string;
  kind: "checking" | "saving" | "card" | "cash" | "other";
  currency: "KRW";
  startingBalanceKrw?: number;
};

type MonthlyAccountBalance = {
  ym: string;
  accountId: string;
  startingBalanceKrw?: number;
  netKrw: number;
  endBalanceKrw?: number;
  hasStartingBalance: boolean;
};

type MissingStartingBalance = {
  accountId: string;
  name: string;
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

function isAccount(value: unknown): value is Account {
  if (!isRecord(value)) return false;
  if (!asString(value.id) || !asString(value.name)) return false;
  const kind = asString(value.kind);
  if (!["checking", "saving", "card", "cash", "other"].includes(kind)) return false;
  return asString(value.currency || "KRW").toUpperCase() === "KRW";
}

function isMonthlyAccountBalance(value: unknown): value is MonthlyAccountBalance {
  if (!isRecord(value)) return false;
  if (!asString(value.ym) || !asString(value.accountId)) return false;
  if (!Number.isFinite(Number(value.netKrw))) return false;
  return typeof value.hasStartingBalance === "boolean";
}

function toNumberLabel(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function buildCsrfQueryPrefix(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `&csrf=${encodeURIComponent(csrf)}`;
}

export function BalancesOverviewClient() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [includeTransfers, setIncludeTransfers] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<MonthlyAccountBalance[]>([]);
  const [notice, setNotice] = useState("");
  const [missingStartingBalances, setMissingStartingBalances] = useState<MissingStartingBalance[]>([]);

  const accountNameById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [accountRes, balanceRes] = await Promise.all([
        fetch(`/api/planning/v3/accounts?csrf=${encodeURIComponent(readDevCsrfToken() ?? "")}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch(`/api/planning/v3/balances/monthly?includeTransfers=${includeTransfers ? "1" : "0"}${buildCsrfQueryPrefix()}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);

      const accountPayload = await accountRes.json().catch(() => null);
      const balancePayload = await balanceRes.json().catch(() => null);

      if (
        !accountRes.ok
        || !balanceRes.ok
        || !isRecord(accountPayload)
        || !isRecord(balancePayload)
        || accountPayload.ok !== true
        || balancePayload.ok !== true
        || !Array.isArray(accountPayload.items)
        || !Array.isArray(balancePayload.items)
      ) {
        setAccounts([]);
        setRows([]);
        setMissingStartingBalances([]);
        setNotice("");
        setErrorMessage("월별 잔액 데이터를 불러오지 못했습니다.");
        return;
      }

      setAccounts(accountPayload.items.filter(isAccount));
      setRows(balancePayload.items.filter(isMonthlyAccountBalance).map((row) => ({
        ym: asString(row.ym),
        accountId: asString(row.accountId),
        netKrw: asNumber(row.netKrw),
        hasStartingBalance: Boolean(row.hasStartingBalance),
        ...(Number.isFinite(Number(row.startingBalanceKrw)) ? { startingBalanceKrw: asNumber(row.startingBalanceKrw) } : {}),
        ...(Number.isFinite(Number(row.endBalanceKrw)) ? { endBalanceKrw: asNumber(row.endBalanceKrw) } : {}),
      })));
      setMissingStartingBalances(
        Array.isArray(balancePayload.missingStartingBalances)
          ? balancePayload.missingStartingBalances
            .filter((row) => isRecord(row) && asString(row.accountId) && asString(row.name))
            .map((row) => ({ accountId: asString(row.accountId), name: asString(row.name) }))
          : [],
      );
      setNotice(asString(balancePayload.notice));
    } catch {
      setAccounts([]);
      setRows([]);
      setMissingStartingBalances([]);
      setNotice("");
      setErrorMessage("월별 잔액 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [includeTransfers]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Balance Overview</h1>
          <p className="text-sm text-slate-600">
            계좌별 초기잔액과 월별 순변동(net)을 누적해 월말 잔액 타임라인을 확인합니다.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={includeTransfers}
                onChange={(event) => {
                  setIncludeTransfers(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              이체 포함
            </label>
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/accounts">
              계좌 관리
            </Link>
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/transactions">
              배치 목록
            </Link>
          </div>
          {notice ? <p className="text-xs font-semibold text-slate-700">{notice}</p> : null}
        </Card>

        {missingStartingBalances.length > 0 ? (
          <Card className="space-y-2 border-amber-200 bg-amber-50">
            <p className="text-sm font-semibold text-amber-900">초기잔액이 없어 잔액 계산 불가</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
              {missingStartingBalances.map((row) => (
                <li key={row.accountId}>
                  {row.name} ({row.accountId})
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">월별 계좌 잔액</h2>
          {errorMessage ? <p className="text-sm font-semibold text-rose-700">{errorMessage}</p> : null}
          {loading ? <p className="text-sm text-slate-600">불러오는 중...</p> : null}
          {!loading && rows.length < 1 ? (
            <p className="text-sm text-slate-600">표시할 월별 잔액 데이터가 없습니다.</p>
          ) : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-balances-table">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">계좌</th>
                    <th className="px-3 py-2 text-left">월</th>
                    <th className="px-3 py-2 text-right">net</th>
                    <th className="px-3 py-2 text-right">월말 잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={`${row.accountId}-${row.ym}`}>
                      <td className="px-3 py-2 text-slate-800">
                        {accountNameById.get(row.accountId) ?? row.accountId}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.ym}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{toNumberLabel(row.netKrw)}</td>
                      <td className="px-3 py-2 text-right text-slate-800">
                        {row.hasStartingBalance && Number.isFinite(row.endBalanceKrw)
                          ? toNumberLabel(asNumber(row.endBalanceKrw))
                          : "잔액 계산 불가"}
                      </td>
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
