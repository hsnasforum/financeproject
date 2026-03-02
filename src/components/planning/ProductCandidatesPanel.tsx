"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { Card } from "@/components/ui/Card";
import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";
import { type NormalizedProduct } from "@/lib/finlife/types";
import { formatKrw, formatPct } from "@/lib/planning/i18n/format";
import { buildCandidatesEvidence } from "@/lib/planning/candidates/buildCandidatesEvidence";
import {
  buildProductCandidateRows,
  type CandidateKind,
  type CandidateSortKey,
} from "@/lib/planning/reports/productCandidates";

type ApiResult = {
  ok?: boolean;
  data?: unknown;
  error?: {
    message?: string;
  };
};

type ProductCandidatesPanelProps = {
  scanAll?: boolean;
};

const TERM_OPTIONS = [6, 12, 24, 36] as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toGroupedNumberInput(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Math.max(0, Math.trunc(value)));
}

function parseGroupedNumberInput(value: string): number {
  const normalized = value.replace(/,/g, "").trim();
  if (normalized.length < 1) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

export default function ProductCandidatesPanel(props: ProductCandidatesPanelProps) {
  const [tab, setTab] = useState<CandidateKind>("deposit");
  const [termMonths, setTermMonths] = useState<number>(12);
  const [usePrimeRate, setUsePrimeRate] = useState<boolean>(true);
  const [taxRatePct, setTaxRatePct] = useState<number>(15.4);
  const [depositPrincipalWon, setDepositPrincipalWon] = useState<number>(10_000_000);
  const [savingMonthlyPaymentWon, setSavingMonthlyPaymentWon] = useState<number>(500_000);
  const [sortKey, setSortKey] = useState<CandidateSortKey>("maturityDesc");
  const [rowsByKind, setRowsByKind] = useState<Record<CandidateKind, NormalizedProduct[]>>({
    deposit: [],
    saving: [],
  });
  const [loadingByKind, setLoadingByKind] = useState<Record<CandidateKind, boolean>>({
    deposit: false,
    saving: false,
  });
  const [errorByKind, setErrorByKind] = useState<Record<CandidateKind, string>>({
    deposit: "",
    saving: "",
  });
  const [drawerProduct, setDrawerProduct] = useState<NormalizedProduct | null>(null);

  useEffect(() => {
    setDrawerProduct(null);
  }, [tab]);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    async function loadKind(kind: CandidateKind): Promise<void> {
      if (rowsByKind[kind].length > 0) return;
      setLoadingByKind((prev) => ({ ...prev, [kind]: true }));
      setErrorByKind((prev) => ({ ...prev, [kind]: "" }));
      try {
        const params = new URLSearchParams();
        params.set("topFinGrpNo", "020000");
        params.set("pageNo", "1");
        params.set("pageSize", "50");
        if (props.scanAll === true) params.set("scan", "all");

        const response = await fetch(`/api/finlife/${kind}?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const raw = (await response.json().catch(() => null)) as ApiResult | null;
        if (!mounted) return;
        const parsed = parseFinlifeApiResponse(raw);
        if (!response.ok || !parsed.ok) {
          setErrorByKind((prev) => ({
            ...prev,
            [kind]: asString(parsed.error?.message) || "상품 후보를 불러오지 못했습니다.",
          }));
          return;
        }
        setRowsByKind((prev) => ({ ...prev, [kind]: parsed.data }));
      } catch (error) {
        if (!mounted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorByKind((prev) => ({
          ...prev,
          [kind]: error instanceof Error ? error.message : "상품 후보를 불러오지 못했습니다.",
        }));
      } finally {
        if (mounted) {
          setLoadingByKind((prev) => ({ ...prev, [kind]: false }));
        }
      }
    }

    void loadKind(tab);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [props.scanAll, rowsByKind, tab]);

  const candidateRows = useMemo(
    () =>
      buildProductCandidateRows(tab, rowsByKind[tab], {
        termMonths,
        usePrimeRate,
        taxRatePct,
        depositPrincipalWon,
        savingMonthlyPaymentWon,
        sortKey,
      }),
    [depositPrincipalWon, rowsByKind, savingMonthlyPaymentWon, sortKey, tab, taxRatePct, termMonths, usePrimeRate],
  );
  const candidatesEvidence = useMemo(
    () => buildCandidatesEvidence({
      kind: tab,
      termMonths,
      taxRatePct,
      usePrimeRate,
      depositPrincipalWon,
      savingMonthlyPaymentWon,
    }),
    [depositPrincipalWon, savingMonthlyPaymentWon, tab, taxRatePct, termMonths, usePrimeRate],
  );

  const amountValue = tab === "deposit" ? depositPrincipalWon : savingMonthlyPaymentWon;
  const isLoading = loadingByKind[tab];
  const error = errorByKind[tab];

  return (
    <Card className="space-y-3" data-testid="planning-candidates" id="candidates">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">상품 후보 비교 (예금/적금)</h2>
        <div className="flex items-center gap-2">
          <button
            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${tab === "deposit" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-700"}`}
            data-testid="candidates-tab-deposit"
            type="button"
            onClick={() => setTab("deposit")}
          >
            예금
          </button>
          <button
            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${tab === "saving" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-700"}`}
            data-testid="candidates-tab-saving"
            type="button"
            onClick={() => setTab("saving")}
          >
            적금
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <label className="text-xs font-semibold text-slate-600">
          기간(개월)
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"
            data-testid="candidates-term"
            value={termMonths}
            onChange={(event) => setTermMonths(Number(event.target.value))}
          >
            {TERM_OPTIONS.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-600">
          세율(%)
          <input
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"
            data-testid="candidates-tax"
            inputMode="decimal"
            type="number"
            value={taxRatePct}
            onChange={(event) => setTaxRatePct(Number(event.target.value) || 0)}
          />
        </label>

        <label className="text-xs font-semibold text-slate-600">
          {tab === "deposit" ? "예치금(원)" : "월 납입액(원)"}
          <input
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"
            data-testid="candidates-amount"
            inputMode="numeric"
            type="text"
            value={toGroupedNumberInput(amountValue)}
            onChange={(event) => {
              const next = parseGroupedNumberInput(event.target.value);
              if (tab === "deposit") setDepositPrincipalWon(next);
              else setSavingMonthlyPaymentWon(next);
            }}
          />
        </label>

        <label className="text-xs font-semibold text-slate-600">
          정렬
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"
            data-testid="candidates-sort"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as CandidateSortKey)}
          >
            <option value="maturityDesc">만기금액 높은 순</option>
            <option value="netInterestDesc">세후이자 높은 순</option>
            <option value="rateDesc">금리 높은 순</option>
            <option value="nameAsc">상품명 가나다순</option>
          </select>
        </label>

        <label className="col-span-2 flex items-end gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
          <input
            checked={usePrimeRate}
            type="checkbox"
            onChange={(event) => setUsePrimeRate(event.target.checked)}
          />
          최고금리 우선 사용 (`intr_rate2`)
        </label>
      </div>

      {isLoading ? <p className="text-sm text-slate-600">상품 후보를 불러오는 중입니다.</p> : null}
      {!isLoading && error ? <p className="text-sm text-rose-700">{error}</p> : null}

      {!isLoading && !error ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="candidates-table">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">금융사</th>
                <th className="px-3 py-2 text-left">상품명</th>
                <th className="px-3 py-2 text-right">기간</th>
                <th className="px-3 py-2 text-right">적용금리</th>
                <th className="px-3 py-2 text-right">세후이자(추정)</th>
                <th className="px-3 py-2 text-right">만기금액(추정)</th>
                <th className="px-3 py-2 text-center">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {candidateRows.length < 1 ? (
                <tr>
                  <td className="px-3 py-2 text-slate-600" colSpan={7}>
                    표시할 후보가 없습니다.
                  </td>
                </tr>
              ) : candidateRows.map((row) => (
                <tr key={`${tab}:${row.product.fin_prdt_cd}`}>
                  <td className="px-3 py-2 text-slate-800">{row.providerName}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{row.productName}</td>
                  <td className="px-3 py-2 text-right">{row.termMonths.toLocaleString("ko-KR")}개월</td>
                  <td className="px-3 py-2 text-right">{formatPct("ko-KR", row.annualRatePct)}</td>
                  <td className="px-3 py-2 text-right">{formatKrw("ko-KR", row.netInterestWon)}</td>
                  <td className="px-3 py-2 text-right">{formatKrw("ko-KR", row.maturityWon)}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={() => setDrawerProduct(row.product)}
                    >
                      자세히
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-slate-600">
        세후 이자/만기금액은 단순 추정치(세율/금리/복리 여부는 설정값). 실제 조건은 상품 약관/우대조건에 따라 달라집니다.
      </p>

      <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-900" data-testid="candidates-evidence-toggle">
          계산 근거 보기
        </summary>
        <div className="mt-2 space-y-2" data-testid="candidates-evidence-panel">
          <p className="font-semibold text-slate-900">{candidatesEvidence.title}</p>
          <p className="text-[11px] text-slate-600">공식: {candidatesEvidence.formula}</p>
          <div>
            <p className="text-[11px] text-slate-600">입력:</p>
            <ul className="list-disc pl-4">
              {candidatesEvidence.inputs.map((input, index) => (
                <li key={`candidates-evidence-input-${index}`}>{input.label}: {String(input.value)}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] text-slate-600">가정:</p>
            <ul className="list-disc pl-4">
              {candidatesEvidence.assumptions.map((assumption, index) => (
                <li key={`candidates-evidence-assumption-${index}`}>{assumption}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      {drawerProduct ? (
        <ProductDetailDrawer
          amountWonDefault={tab === "deposit" ? depositPrincipalWon : savingMonthlyPaymentWon}
          kind={tab}
          onOpenChange={(open) => {
            if (!open) setDrawerProduct(null);
          }}
          open={drawerProduct !== null}
          product={drawerProduct}
        />
      ) : null}
    </Card>
  );
}
