"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorAnnouncer } from "@/components/forms/ErrorAnnouncer";
import { NumberField } from "@/components/forms/NumberField";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { FieldError } from "@/components/forms/FieldError";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { announce, focusFirstError, scrollToErrorSummary } from "@/lib/forms/a11y";
import { pathToId } from "@/lib/forms/ids";
import { issuesToFieldMap } from "@/lib/forms/issueMap";
import { housingBurden } from "@/lib/housing/afford";
import { parseHousingAfford, type HousingAffordMode } from "@/lib/schemas/housingAfford";

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
      links.push({ href: "/products/mortgage-loan", label: "주담대 상품 보기" });
    } else {
      links.push({ href: "/products/rent-house-loan", label: "전월세 대출 보기" });
    }
    if ((result.housingRatioPct ?? 0) >= 30) {
      links.push({ href: "/housing/subscription?region=전국&mode=all&houseType=apt", label: "청약 공고 보기" });
    }
    if (result.residualCashFlow < 0 || (result.housingRatioPct ?? 0) >= 40) {
      links.push({ href: "/gov24", label: "지원금/혜택 찾아보기" });
    }
    return links;
  }, [mode, result.housingRatioPct, result.residualCashFlow]);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="주거비 부담 계산기" subtitle="전월세/매매 조건별 월 주거비와 잔여현금흐름을 즉시 계산합니다." />

        <Card>
          <ErrorSummary issues={parsedInput.issues} id={ERROR_SUMMARY_ID} className="mb-3" />
          <ErrorAnnouncer />
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              계산 모드
              <select
                id={pathToId("mode")}
                className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                value={mode}
                onChange={(e) => setMode(e.target.value === "buy" ? "buy" : "rent")}
                aria-invalid={Boolean(fieldIssueMap.mode?.[0])}
                aria-describedby={fieldIssueMap.mode?.[0] ? `${pathToId("mode")}_error` : undefined}
              >
                <option value="rent">전월세</option>
                <option value="buy">매매(대출)</option>
              </select>
              <FieldError id={`${pathToId("mode")}_error`} message={fieldIssueMap.mode?.[0]} />
            </label>
            <label className="text-sm">
              월 소득(세후)
              <NumberField
                id={pathToId("incomeNet")}
                className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                value={toNumberOrNull(incomeNetInput)}
                onValueChange={(value) => setIncomeNetInput(value === null ? "" : String(value))}
                aria-invalid={Boolean(fieldIssueMap.incomeNet?.[0])}
                aria-describedby={fieldIssueMap.incomeNet?.[0] ? `${pathToId("incomeNet")}_error` : undefined}
              />
              <FieldError id={`${pathToId("incomeNet")}_error`} message={fieldIssueMap.incomeNet?.[0]} />
            </label>
            <label className="text-sm">
              주거 외 월 지출
              <NumberField
                id={pathToId("outflow")}
                className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                value={toNumberOrNull(outflowInput)}
                onValueChange={(value) => setOutflowInput(value === null ? "" : String(value))}
                aria-invalid={Boolean(fieldIssueMap.outflow?.[0])}
                aria-describedby={fieldIssueMap.outflow?.[0] ? `${pathToId("outflow")}_error` : undefined}
              />
              <FieldError id={`${pathToId("outflow")}_error`} message={fieldIssueMap.outflow?.[0]} />
            </label>
          </div>

          {mode === "rent" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm">
                보증금
                <NumberField
                  id={pathToId("deposit")}
                  className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                  value={toNumberOrNull(depositInput)}
                  onValueChange={(value) => setDepositInput(value === null ? "" : String(value))}
                  aria-invalid={Boolean(fieldIssueMap.deposit?.[0])}
                  aria-describedby={fieldIssueMap.deposit?.[0] ? `${pathToId("deposit")}_error` : undefined}
                />
                <FieldError id={`${pathToId("deposit")}_error`} message={fieldIssueMap.deposit?.[0]} />
              </label>
              <label className="text-sm">
                월세
                <NumberField
                  id={pathToId("monthlyRent")}
                  className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                  value={toNumberOrNull(monthlyRentInput)}
                  onValueChange={(value) => setMonthlyRentInput(value === null ? "" : String(value))}
                  aria-invalid={Boolean(fieldIssueMap.monthlyRent?.[0])}
                  aria-describedby={fieldIssueMap.monthlyRent?.[0] ? `${pathToId("monthlyRent")}_error` : undefined}
                />
                <FieldError id={`${pathToId("monthlyRent")}_error`} message={fieldIssueMap.monthlyRent?.[0]} />
              </label>
              <label className="text-sm">
                보증금 월환산 이율(연%)
                <NumberField
                  id={pathToId("opportunityAprPct")}
                  className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                  value={toNumberOrNull(opportunityAprPctInput)}
                  onValueChange={(value) => setOpportunityAprPctInput(value === null ? "" : String(value))}
                  aria-invalid={Boolean(fieldIssueMap.opportunityAprPct?.[0])}
                  aria-describedby={fieldIssueMap.opportunityAprPct?.[0] ? `${pathToId("opportunityAprPct")}_error` : undefined}
                />
                <FieldError id={`${pathToId("opportunityAprPct")}_error`} message={fieldIssueMap.opportunityAprPct?.[0]} />
              </label>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <label className="text-sm">
                매매가
                <NumberField
                  id={pathToId("purchasePrice")}
                  className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                  value={toNumberOrNull(purchasePriceInput)}
                  onValueChange={(value) => setPurchasePriceInput(value === null ? "" : String(value))}
                  aria-invalid={Boolean(fieldIssueMap.purchasePrice?.[0])}
                  aria-describedby={fieldIssueMap.purchasePrice?.[0] ? `${pathToId("purchasePrice")}_error` : undefined}
                />
                <FieldError id={`${pathToId("purchasePrice")}_error`} message={fieldIssueMap.purchasePrice?.[0]} />
              </label>
              <label className="text-sm">
                자기자본
                <NumberField
                  id={pathToId("equity")}
                  className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                  value={toNumberOrNull(equityInput)}
                  onValueChange={(value) => setEquityInput(value === null ? "" : String(value))}
                  aria-invalid={Boolean(fieldIssueMap.equity?.[0])}
                  aria-describedby={fieldIssueMap.equity?.[0] ? `${pathToId("equity")}_error` : undefined}
                />
                <FieldError id={`${pathToId("equity")}_error`} message={fieldIssueMap.equity?.[0]} />
              </label>
              <label className="text-sm">
                대출금리(연%)
                <NumberField
                  id={pathToId("loanAprPct")}
                  className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                  value={toNumberOrNull(loanAprPctInput)}
                  onValueChange={(value) => setLoanAprPctInput(value === null ? "" : String(value))}
                  aria-invalid={Boolean(fieldIssueMap.loanAprPct?.[0])}
                  aria-describedby={fieldIssueMap.loanAprPct?.[0] ? `${pathToId("loanAprPct")}_error` : undefined}
                />
                <FieldError id={`${pathToId("loanAprPct")}_error`} message={fieldIssueMap.loanAprPct?.[0]} />
              </label>
              <label className="text-sm">
                대출기간(개월)
                <NumberField
                  id={pathToId("termMonths")}
                  className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                  value={toNumberOrNull(termMonthsInput)}
                  onValueChange={(value) => setTermMonthsInput(value === null ? "" : String(value))}
                  aria-invalid={Boolean(fieldIssueMap.termMonths?.[0])}
                  aria-describedby={fieldIssueMap.termMonths?.[0] ? `${pathToId("termMonths")}_error` : undefined}
                />
                <FieldError id={`${pathToId("termMonths")}_error`} message={fieldIssueMap.termMonths?.[0]} />
              </label>
            </div>
          )}
        </Card>

        <Card className="mt-4 border-emerald-200 bg-emerald-50/40">
          <h2 className="text-lg font-semibold text-emerald-900">계산 결과</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-white p-3">
              <p className="text-xs text-slate-500">월 주거비</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{fmtKrw(result.monthlyHousingCost)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-3">
              <p className="text-xs text-slate-500">주거비율</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{fmtPct(result.housingRatioPct)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-3">
              <p className="text-xs text-slate-500">잔여현금흐름</p>
              <p className={`mt-1 text-lg font-semibold ${result.residualCashFlow < 0 ? "text-rose-700" : "text-slate-900"}`}>{fmtKrw(result.residualCashFlow)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-3">
              <p className="text-xs text-slate-500">경고 수</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{result.warnings.length}건</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
            {mode === "rent" ? (
              <>
                <p>월세: {fmtKrw(result.breakdown.monthlyRent)}</p>
                <p>보증금 월환산: {fmtKrw(result.breakdown.depositOpportunityCostMonthly)}</p>
              </>
            ) : (
              <>
                <p>대출 원금: {fmtKrw(result.breakdown.principal)}</p>
                <p>월 원리금균등 상환: {fmtKrw(result.breakdown.monthlyMortgagePayment)}</p>
              </>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-800">경고</p>
            {result.warnings.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">현재 조건에서 즉시 경고는 없습니다.</p>
            )}
          </div>

          {ctaLinks.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {ctaLinks.map((link) => (
                <Link key={`${link.href}-${link.label}`} href={link.href}>
                  <Button size="sm" variant="outline">{link.label}</Button>
                </Link>
              ))}
            </div>
          ) : null}
        </Card>
      </Container>
    </main>
  );
}
