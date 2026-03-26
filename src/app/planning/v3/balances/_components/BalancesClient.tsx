"use client";

import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { ReportHeroCard, ReportHeroStatCard, ReportHeroStatGrid } from "@/components/ui/ReportTone";
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

const BALANCES_STAGGER_REVEAL: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
      duration: 0.32,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const BALANCES_SECTION_REVEAL: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const balancesActionLinkClassName =
  "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900";

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
  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );
  const accountCoverage = useMemo(() => new Set(rows.map((row) => row.accountId)).size, [rows]);
  const monthCoverage = useMemo(() => new Set(rows.map((row) => row.ym)).size, [rows]);
  const latestMonth = rows[rows.length - 1]?.ym ?? null;

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
    <PageShell className="relative">
      <motion.div
        className="space-y-6 md:space-y-8"
        initial="hidden"
        animate="visible"
        variants={BALANCES_STAGGER_REVEAL}
      >
        <ReportHeroCard
          kicker="Balance Timeline"
          title="월별 잔액 흐름을 같은 기준으로 확인합니다"
          description="거래 배치와 초기잔액을 연결해서 계좌별 opening, net, closing 변화를 월 단위 표로 확인합니다."
          className="overflow-hidden border border-slate-200/90 bg-white shadow-sm shadow-slate-200/50"
          contentClassName="space-y-6 p-6 md:p-8 lg:p-9"
          action={(
            <>
              <Link className={balancesActionLinkClassName} href="/planning/v3/transactions/batches">
                배치 목록
              </Link>
              <Link className={balancesActionLinkClassName} href="/planning/v3/profile/drafts">
                profile drafts 확인
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
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="rounded-[1.75rem] border border-emerald-200/90 bg-emerald-50/90 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-emerald-500" />
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">현재 작업 기준</p>
                  <p className="text-sm font-bold leading-relaxed tracking-tight text-slate-800">
                    {selectedBatch
                      ? `${selectedBatch.id} 기준으로 ${selectedBatch.rowCount.toLocaleString("ko-KR")}건 거래를 월별 잔액으로 정리합니다.`
                      : "먼저 배치를 선택하면 월별 opening · net · closing 흐름이 같은 기준으로 정리됩니다."}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    이 화면은 import 결과 projection 확인 축입니다. 확인이 끝나면 profile drafts에서 stable handoff 직전 초안을 검토합니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200/90 bg-slate-50/80 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">빠른 상태 요약</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  월 범위 {monthCoverage > 0 ? `${monthCoverage}개월` : "-"}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  반영 계좌 {accountCoverage > 0 ? `${accountCoverage}개` : "-"}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  최근 월 {latestMonth ?? "-"}
                </span>
              </div>
            </div>
          </div>
          {message ? <p className="text-xs font-semibold text-rose-500">{message}</p> : null}
        </ReportHeroCard>

        <motion.section
          variants={BALANCES_SECTION_REVEAL}
          className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]"
        >
          <div className="space-y-4">
            <motion.div
              variants={BALANCES_SECTION_REVEAL}
              className="rounded-[2rem] border border-slate-200/90 bg-white px-5 py-5 shadow-sm shadow-slate-200/40 md:px-6"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <SubSectionHeader
                title="조회 기준"
                description="먼저 계산할 배치를 고르고, transfer 포함 여부를 정하면 아래 표가 같은 기준으로 다시 계산됩니다."
                className="mb-0 items-start"
                action={(
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    핵심 작업
                  </span>
                )}
              />

              <div className="mt-5 rounded-[1.5rem] border border-slate-200/90 bg-slate-50/80 px-4 py-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <label className="text-sm font-semibold text-slate-700">
                    배치 선택
                    <select
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
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

                  <label className="inline-flex h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
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

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                  <span className="rounded-full bg-white px-3 py-1.5">배치 {selectedBatch ? "선택됨" : "미선택"}</span>
                  <span className="rounded-full bg-white px-3 py-1.5">계산 기준 {includeTransfers ? "transfer 포함" : "transfer 제외"}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className={balancesActionLinkClassName} href="/planning/v3/profile/drafts">
                    다음 단계: profile drafts 검토
                  </Link>
                  <Link className={`${balancesActionLinkClassName} text-slate-500`} href="/planning/v3/accounts">
                    Support: 계좌 관리
                  </Link>
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={BALANCES_SECTION_REVEAL}
              className="rounded-[2rem] border border-slate-200/90 bg-white px-5 py-5 shadow-sm shadow-slate-200/40 md:px-6"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <SubSectionHeader
                title="월별 잔액 표"
                description="opening, net, closing 흐름을 한 표에서 비교합니다. selector와 data-testid 계약은 유지됩니다."
                className="mb-0 items-start"
                action={<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">행 {rows.length}개</span>}
              />

              <div className="mt-5 rounded-[1.5rem] border border-slate-200/90 bg-slate-50/70 px-3 py-3 md:px-4">
                {loading ? <p className="px-1 py-4 text-sm font-medium text-slate-600">불러오는 중...</p> : null}
                {!loading && rows.length < 1 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-white px-5 py-8 text-center">
                    <p className="text-sm font-bold text-slate-900">표시할 잔액 데이터가 없습니다.</p>
                    <p className="mt-2 text-xs font-medium text-slate-500">배치를 고른 뒤 다시 계산하면 월별 잔액 흐름이 여기에 표시됩니다.</p>
                  </div>
                ) : null}

                {rows.length > 0 ? (
                  <div className="overflow-x-auto rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
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
                          <tr
                            key={`${row.ym}-${row.accountId}`}
                            className="transition-colors hover:bg-emerald-50/40"
                          >
                            <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.ym}</td>
                            <td className="px-3 py-2 text-slate-800">{accountNameById.get(row.accountId) ?? row.accountId}</td>
                            <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.openingKrw)}</td>
                            <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.netChangeKrw)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(row.closingKrw)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.transferKrw ?? 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>

          <motion.aside
            variants={BALANCES_SECTION_REVEAL}
            className="space-y-4"
          >
            <motion.div
              className="rounded-[2rem] border border-slate-200/90 bg-slate-50/90 px-5 py-5 shadow-sm shadow-slate-200/30"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <SubSectionHeader
                title="선택 배치 메모"
                description="현재 계산에 바로 영향을 주는 기준만 오른쪽 보조 패널에 모았습니다."
                className="mb-0 items-start"
              />
              <div className="mt-5 space-y-3 text-sm text-slate-600">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">배치 ID</p>
                  <p className="mt-2 break-all text-sm font-bold text-slate-900">{selectedBatch?.id ?? "아직 선택되지 않았습니다."}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">행 수</p>
                    <p className="mt-2 text-lg font-black tracking-tight text-slate-900">{selectedBatch ? `${selectedBatch.rowCount}건` : "-"}</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">월 범위</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      {selectedBatch?.ymMin && selectedBatch?.ymMax ? `${selectedBatch.ymMin} ~ ${selectedBatch.ymMax}` : "월 정보 없음"}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {warnings.length > 0 ? (
              <motion.div
                variants={BALANCES_SECTION_REVEAL}
                className="rounded-[2rem] border border-amber-200/90 bg-amber-50/90 px-5 py-5 shadow-sm shadow-amber-100/70"
                whileHover={{ y: -2 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <SubSectionHeader
                  title="주의"
                  description="계산 결과를 읽기 전에 확인할 항목입니다."
                  className="mb-0 items-start"
                  titleClassName="text-amber-950"
                  descriptionClassName="text-amber-800/80"
                />
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm font-medium text-amber-900/90">
                  {warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </motion.div>
            ) : (
              <motion.div
                variants={BALANCES_SECTION_REVEAL}
                className="rounded-[2rem] border border-slate-200/90 bg-slate-50/90 px-5 py-5 shadow-sm shadow-slate-200/30"
                whileHover={{ y: -2 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <SubSectionHeader
                  title="체크 포인트"
                  description="현재 화면을 읽을 때 같이 보면 좋은 보조 설명입니다."
                  className="mb-0 items-start"
                />
                <div className="mt-4 space-y-3">
                  {[
                    "opening은 계좌 시작 잔액, net은 월간 순변화, closing은 누적 결과입니다.",
                    includeTransfers ? "현재는 transfer가 순변화 계산에 포함됩니다." : "현재는 transfer를 제외한 순변화만 계산합니다.",
                    "계좌 시작 잔액이 없는 경우 일부 결과 해석이 제한될 수 있습니다.",
                  ].map((item) => (
                    <div key={item} className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm font-medium leading-relaxed text-slate-600 shadow-sm">
                      {item}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.aside>
        </motion.section>

      </motion.div>
    </PageShell>
  );
}
