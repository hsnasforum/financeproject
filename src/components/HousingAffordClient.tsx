"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorAnnouncer } from "@/components/forms/ErrorAnnouncer";
import { NumberField } from "@/components/forms/NumberField";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { FieldError } from "@/components/forms/FieldError";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { announce, focusFirstError, scrollToErrorSummary } from "@/lib/forms/a11y";
import { pathToId } from "@/lib/forms/ids";
import { issuesToFieldMap } from "@/lib/forms/issueMap";
import { housingBurden } from "@/lib/housing/afford";
import { parseHousingAfford, type HousingAffordMode } from "@/lib/schemas/housingAfford";
import { cn } from "@/lib/utils";

const ERROR_SUMMARY_ID = "housing_afford_error_summary";

type HousingAffordClientProps = {
  initialIncomeNet?: number;
  initialOutflow?: number;
  initialMode?: HousingAffordMode;
  initialDeposit?: number;
  initialMonthlyRent?: number;
  initialOpportunityAprPct?: number;
  initialPurchasePrice?: number;
  initialEquity?: number;
  initialLoanAprPct?: number;
  initialTermMonths?: number;
};

function fmtKrw(value: number): string {
  return `${Math.round(value).toLocaleString()}원`;
}

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function toNumberOrNull(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function HousingAffordClient({
  initialIncomeNet = 3_500_000,
  initialOutflow = 1_800_000,
  initialMode = "rent",
  initialDeposit = 100_000_000,
  initialMonthlyRent = 700_000,
  initialOpportunityAprPct = 3,
  initialPurchasePrice = 500_000_000,
  initialEquity = 150_000_000,
  initialLoanAprPct = 4.2,
  initialTermMonths = 360,
}: HousingAffordClientProps) {
  const [mode, setMode] = useState<HousingAffordMode>(initialMode === "buy" ? "buy" : "rent");
  const [incomeNetInput, setIncomeNetInput] = useState(String(initialIncomeNet));
  const [outflowInput, setOutflowInput] = useState(String(initialOutflow));
  const [depositInput, setDepositInput] = useState(String(initialDeposit));
  const [monthlyRentInput, setMonthlyRentInput] = useState(String(initialMonthlyRent));
  const [opportunityAprPctInput, setOpportunityAprPctInput] = useState(String(initialOpportunityAprPct));
  const [purchasePriceInput, setPurchasePriceInput] = useState(String(initialPurchasePrice));
  const [equityInput, setEquityInput] = useState(String(initialEquity));
  const [loanAprPctInput, setLoanAprPctInput] = useState(String(initialLoanAprPct));
  const [termMonthsInput, setTermMonthsInput] = useState(String(initialTermMonths));
  const lastIssueSignatureRef = useRef("");

  const parsedInput = useMemo(() => {
    return parseHousingAfford({
      mode,
      incomeNet: incomeNetInput,
      outflow: outflowInput,
      deposit: depositInput,
      monthlyRent: monthlyRentInput,
      opportunityAprPct: opportunityAprPctInput,
      purchasePrice: purchasePriceInput,
      equity: equityInput,
      loanAprPct: loanAprPctInput,
      termMonths: termMonthsInput,
    });
  }, [
    mode,
    incomeNetInput,
    outflowInput,
    depositInput,
    monthlyRentInput,
    opportunityAprPctInput,
    purchasePriceInput,
    equityInput,
    loanAprPctInput,
    termMonthsInput,
  ]);

  const fieldIssueMap = useMemo(() => issuesToFieldMap(parsedInput.issues), [parsedInput.issues]);

  useEffect(() => {
    if (parsedInput.issues.length === 0) {
      lastIssueSignatureRef.current = "";
      return;
    }
    const signature = parsedInput.issues.map((entry) => `${entry.path}:${entry.message}`).join("|");
    if (signature === lastIssueSignatureRef.current) return;
    lastIssueSignatureRef.current = signature;
    setTimeout(() => {
      scrollToErrorSummary(ERROR_SUMMARY_ID);
      const activeId = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement.id
        : "";
      const paths = parsedInput.issues.map((entry) => entry.path);
      const includesActive = paths.some((path) => pathToId(path) === activeId);
      if (!includesActive) {
        focusFirstError(paths);
      }
      announce(`입력 오류 ${parsedInput.issues.length}건이 있습니다.`);
    }, 0);
  }, [parsedInput.issues]);

  const result = useMemo(() => {
    const normalized = parsedInput.value;
    return housingBurden({
      incomeNetMonthly: normalized.incomeNet,
      nonHousingOutflowMonthly: normalized.outflow,
      mode: normalized.mode,
      rent: {
        deposit: normalized.deposit,
        monthlyRent: normalized.monthlyRent,
        opportunityAprPct: normalized.opportunityAprPct,
      },
      buy: {
        purchasePrice: normalized.purchasePrice,
        equity: normalized.equity,
        loanAprPct: normalized.loanAprPct,
        termMonths: normalized.termMonths,
      },
    });
  }, [parsedInput.value]);

  const ctaLinks = useMemo(() => {
    const links: Array<{ href: string; label: string }> = [];
    if (mode === "buy") {
      links.push({ href: "/products/mortgage-loan", label: "주담대 조건 다시 보기" });
    } else {
      links.push({ href: "/products/rent-house-loan", label: "전월세 대출 조건 다시 보기" });
    }
    if ((result.housingRatioPct ?? 0) >= 30) {
      links.push({ href: "/housing/subscription?region=전국&mode=all&houseType=apt", label: "청약 공고 다시 보기" });
    }
    if (result.residualCashFlow < 0 || (result.housingRatioPct ?? 0) >= 40) {
      links.push({ href: "/gov24", label: "지원금·혜택 다시 보기" });
    }
    return links;
  }, [mode, result.housingRatioPct, result.residualCashFlow]);

  const incomeVal = Number(incomeNetInput) || 1;
  const otherOutflowVal = Number(outflowInput) || 0;
  const housingCostVal = result.monthlyHousingCost || 0;

  return (
    <PageShell>
      <PageHeader
        title="주거비 부담 계산기"
        description="현재 입력한 전월세·매매 조건으로 월 주거비와 잔여현금흐름을 비교해 봅니다."
      />

      <div className="space-y-6">
        <Card className="rounded-[2rem] border border-slate-100 bg-slate-50/70 p-6 shadow-sm">
          <p className="text-sm font-black text-slate-800">결과를 읽는 기준</p>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
            이 계산은 현재 입력한 소득, 지출, 주거 조건을 기준으로 비교한 참고 결과입니다.
          </p>
          <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">
            실제 대출 가능 금액, 금리, 청약 자격, 지원 조건은 다음 단계 화면에서 다시 확인해 주세요.
          </p>
        </Card>

        <Card className="rounded-[2rem] p-8 shadow-sm">
          <SubSectionHeader title="기본 정보 및 소득" description="월 소득과 고정 지출을 입력하세요." />
          <ErrorSummary issues={parsedInput.issues} id={ERROR_SUMMARY_ID} className="mt-4" />
          <ErrorAnnouncer />

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">계산 모드</label>
              <select
                id={pathToId("mode")}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
                value={mode}
                onChange={(e) => setMode(e.target.value === "buy" ? "buy" : "rent")}
                aria-invalid={Boolean(fieldIssueMap.mode?.[0])}
                aria-describedby={fieldIssueMap.mode?.[0] ? `${pathToId("mode")}_error` : undefined}
              >
                <option value="rent">전월세</option>
                <option value="buy">매매(대출)</option>
              </select>
              <FieldError id={`${pathToId("mode")}_error`} message={fieldIssueMap.mode?.[0]} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">월 소득 (세후)</label>
              <div className="relative">
                <NumberField
                  id={pathToId("incomeNet")}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
                  value={toNumberOrNull(incomeNetInput)}
                  onValueChange={(value) => setIncomeNetInput(value === null ? "" : String(value))}
                  aria-invalid={Boolean(fieldIssueMap.incomeNet?.[0])}
                  aria-describedby={fieldIssueMap.incomeNet?.[0] ? `${pathToId("incomeNet")}_error` : undefined}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">원</span>
              </div>
              <FieldError id={`${pathToId("incomeNet")}_error`} message={fieldIssueMap.incomeNet?.[0]} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">주거 외 월 지출</label>
              <div className="relative">
                <NumberField
                  id={pathToId("outflow")}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
                  value={toNumberOrNull(outflowInput)}
                  onValueChange={(value) => setOutflowInput(value === null ? "" : String(value))}
                  aria-invalid={Boolean(fieldIssueMap.outflow?.[0])}
                  aria-describedby={fieldIssueMap.outflow?.[0] ? `${pathToId("outflow")}_error` : undefined}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">원</span>
              </div>
              <FieldError id={`${pathToId("outflow")}_error`} message={fieldIssueMap.outflow?.[0]} />
            </div>
          </div>
        </Card>

        <Card className="rounded-[2rem] p-8 shadow-sm">
          <SubSectionHeader
            title={mode === "rent" ? "전월세 조건" : "매매 및 대출 조건"}
            description={mode === "rent" ? "보증금과 월세 정보를 입력하세요." : "매매가와 대출 상세 정보를 입력하세요."}
          />

          <div className="mt-6">
            {mode === "rent" ? (
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">보증금</label>
                  <div className="relative">
                    <NumberField
                      id={pathToId("deposit")}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
                      value={toNumberOrNull(depositInput)}
                      onValueChange={(value) => setDepositInput(value === null ? "" : String(value))}
                      aria-invalid={Boolean(fieldIssueMap.deposit?.[0])}
                      aria-describedby={fieldIssueMap.deposit?.[0] ? `${pathToId("deposit")}_error` : undefined}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">원</span>
                  </div>
                  <FieldError id={`${pathToId("deposit")}_error`} message={fieldIssueMap.deposit?.[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">월세</label>
                  <div className="relative">
                    <NumberField
                      id={pathToId("monthlyRent")}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
                      value={toNumberOrNull(monthlyRentInput)}
                      onValueChange={(value) => setMonthlyRentInput(value === null ? "" : String(value))}
                      aria-invalid={Boolean(fieldIssueMap.monthlyRent?.[0])}
                      aria-describedby={fieldIssueMap.monthlyRent?.[0] ? `${pathToId("monthlyRent")}_error` : undefined}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">원</span>
                  </div>
                  <FieldError id={`${pathToId("monthlyRent")}_error`} message={fieldIssueMap.monthlyRent?.[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">보증금 월환산 이율 (연%)</label>
                  <div className="relative">
                    <NumberField
                      id={pathToId("opportunityAprPct")}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
                      value={toNumberOrNull(opportunityAprPctInput)}
                      onValueChange={(value) => setOpportunityAprPctInput(value === null ? "" : String(value))}
                      aria-invalid={Boolean(fieldIssueMap.opportunityAprPct?.[0])}
                      aria-describedby={fieldIssueMap.opportunityAprPct?.[0] ? `${pathToId("opportunityAprPct")}_error` : undefined}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                  </div>
                  <FieldError id={`${pathToId("opportunityAprPct")}_error`} message={fieldIssueMap.opportunityAprPct?.[0]} />
                </div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">매매가</label>
                  <div className="relative">
                    <NumberField
                      id={pathToId("purchasePrice")}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
                      value={toNumberOrNull(purchasePriceInput)}
                      onValueChange={(value) => setPurchasePriceInput(value === null ? "" : String(value))}
                      aria-invalid={Boolean(fieldIssueMap.purchasePrice?.[0])}
                      aria-describedby={fieldIssueMap.purchasePrice?.[0] ? `${pathToId("purchasePrice")}_error` : undefined}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">원</span>
                  </div>
                  <FieldError id={`${pathToId("purchasePrice")}_error`} message={fieldIssueMap.purchasePrice?.[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">자기자본</label>
                  <div className="relative">
                    <NumberField
                      id={pathToId("equity")}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
                      value={toNumberOrNull(equityInput)}
                      onValueChange={(value) => setEquityInput(value === null ? "" : String(value))}
                      aria-invalid={Boolean(fieldIssueMap.equity?.[0])}
                      aria-describedby={fieldIssueMap.equity?.[0] ? `${pathToId("equity")}_error` : undefined}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">원</span>
                  </div>
                  <FieldError id={`${pathToId("equity")}_error`} message={fieldIssueMap.equity?.[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">대출금리 (연%)</label>
                  <div className="relative">
                    <NumberField
                      id={pathToId("loanAprPct")}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
                      value={toNumberOrNull(loanAprPctInput)}
                      onValueChange={(value) => setLoanAprPctInput(value === null ? "" : String(value))}
                      aria-invalid={Boolean(fieldIssueMap.loanAprPct?.[0])}
                      aria-describedby={fieldIssueMap.loanAprPct?.[0] ? `${pathToId("loanAprPct")}_error` : undefined}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                  </div>
                  <FieldError id={`${pathToId("loanAprPct")}_error`} message={fieldIssueMap.loanAprPct?.[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">대출기간 (개월)</label>
                  <div className="relative">
                    <NumberField
                      id={pathToId("termMonths")}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
                      value={toNumberOrNull(termMonthsInput)}
                      onValueChange={(value) => setTermMonthsInput(value === null ? "" : String(value))}
                      aria-invalid={Boolean(fieldIssueMap.termMonths?.[0])}
                      aria-describedby={fieldIssueMap.termMonths?.[0] ? `${pathToId("termMonths")}_error` : undefined}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">개월</span>
                  </div>
                  <FieldError id={`${pathToId("termMonths")}_error`} message={fieldIssueMap.termMonths?.[0]} />
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="rounded-[2rem] p-8 shadow-sm lg:col-span-2 border-emerald-100 bg-white">
            <SubSectionHeader title="현재 조건 기준 계산 결과" description="입력한 소득·지출·주거 조건으로 비교한 결과입니다." />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-emerald-50 bg-slate-50/50 p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">월 총 주거비</p>
                <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{fmtKrw(result.monthlyHousingCost)}</p>

                <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
                  {mode === "rent" ? (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500">순수 월세</span>
                        <span className="font-black text-slate-700 tabular-nums">{fmtKrw(result.breakdown.monthlyRent)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500">보증금 기회비용</span>
                        <span className="font-black text-slate-700 tabular-nums">{fmtKrw(result.breakdown.depositOpportunityCostMonthly)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500">대출 원금</span>
                        <span className="font-black text-slate-700 tabular-nums">{fmtKrw(result.breakdown.principal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500">월 원리금 상환</span>
                        <span className="font-black text-slate-700 tabular-nums">{fmtKrw(result.breakdown.monthlyMortgagePayment)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-50 bg-slate-50/50 p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">주거비율 및 잔여현금</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{fmtPct(result.housingRatioPct)}</p>
                  <span className={cn(
                    "rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border",
                    (result.housingRatioPct ?? 0) <= 25 ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                    (result.housingRatioPct ?? 0) <= 35 ? "bg-amber-50 text-amber-600 border-amber-100" :
                    "bg-rose-50 text-rose-600 border-rose-100"
                  )}>
                    {(result.housingRatioPct ?? 0) <= 25 ? "안전" : (result.housingRatioPct ?? 0) <= 35 ? "주의" : "위험"}
                  </span>
                </div>

                <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-500">잔여 현금흐름</span>
                    <span className={cn("font-black tabular-nums", result.residualCashFlow < 0 ? "text-rose-600" : "text-emerald-600")}>
                      {fmtKrw(result.residualCashFlow)}
                    </span>
                  </div>

                  {/* Housing Ratio Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          (result.housingRatioPct ?? 0) <= 25 ? "bg-emerald-500" :
                          (result.housingRatioPct ?? 0) <= 35 ? "bg-amber-500" : "bg-rose-500"
                        )}
                        style={{ width: `${Math.min(100, result.housingRatioPct ?? 0)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      <span>0%</span>
                      <span>권장 25%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cashflow Breakdown Bar */}
            <div className="mt-8 space-y-3 rounded-3xl bg-slate-50 p-8 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">월 현금흐름 구성</p>
                <p className="text-xs font-black text-emerald-600">월 소득 기준 {fmtKrw(Number(incomeNetInput))}</p>
              </div>

              <div className="h-4 w-full flex overflow-hidden rounded-full bg-slate-200 mt-4">
                <div
                  className="h-full bg-slate-400 border-r border-white/20"
                  style={{ width: `${Math.min(100, (otherOutflowVal / incomeVal) * 100)}%` }}
                  title="기타 지출"
                />
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${Math.min(100, (housingCostVal / incomeVal) * 100)}%` }}
                  title="주거비"
                />
              </div>

              <div className="flex flex-wrap gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500">기타 지출 ({Math.round((otherOutflowVal / incomeVal) * 100)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-bold text-slate-500">주거비 ({Math.round((housingCostVal / incomeVal) * 100)}%)</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">잔여 {Math.max(0, Math.round((result.residualCashFlow / incomeVal) * 100))}%</span>
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[2rem] p-8 shadow-sm">
              <SubSectionHeader title="다시 확인할 리스크와 경고" description={`현재 조건에서 ${result.warnings.length}개 항목을 다시 볼 수 있습니다.`} />
              {result.warnings.length > 0 ? (
                <ul className="mt-6 space-y-3">
                  {result.warnings.map((warning, idx) => (
                    <li key={idx} className="flex items-start gap-3 rounded-2xl bg-rose-50/50 p-4 border border-rose-100/50">
                      <span className="text-rose-500 mt-0.5">⚠️</span>
                      <p className="text-xs font-bold text-rose-800 leading-relaxed">{warning}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-6 py-10 text-center rounded-3xl border border-dashed border-slate-100">
                  <p className="text-xs font-bold text-slate-400">현재 조건에서 즉시 경고는 없습니다.</p>
                </div>
              )}
            </Card>

            <Card className="rounded-[2rem] p-8 shadow-xl shadow-emerald-900/20 bg-emerald-600 text-white border-none">
              <SubSectionHeader
                title="다음에 확인할 곳"
                description="현재 계산 뒤에 이어서 볼 수 있는 비교 화면입니다."
                titleClassName="text-white"
                descriptionClassName="text-emerald-100/70"
              />
              <div className="mt-6 grid gap-2">
                {ctaLinks.map((link) => (
                  <Link key={`${link.href}-${link.label}`} href={link.href} className="group">
                    <div className="flex items-center justify-between rounded-2xl bg-white/10 p-4 transition-all hover:bg-white/20 active:scale-[0.98]">
                      <span className="text-sm font-black tracking-tight">{link.label}</span>
                      <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity">▶</span>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
