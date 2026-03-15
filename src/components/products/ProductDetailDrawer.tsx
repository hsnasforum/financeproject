"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { calcDeposit, calcSaving } from "@/lib/planning/calc";
import { FINLIFE_FIELD_CONFIG } from "@/lib/finlife/fieldConfig";
import { buildConsumerNotes, formatGlossaryValue, getKindSummary } from "@/lib/finlife/glossary";
import { presentBySpecs, presentOptionFallback } from "@/lib/finlife/present";
import { formatKrwWithEok } from "@/lib/format/krw";
import { type FinlifeKind, type NormalizedOption, type NormalizedProduct } from "@/lib/finlife/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FinlifeKind;
  product: NormalizedProduct;
  amountWonDefault: number;
};

function parseTerm(option: NormalizedOption): number {
  const value = Number(String(option.save_trm ?? "").replace(/[^0-9]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : 12;
}

function pickRate(option: NormalizedOption, usePrime: boolean): number {
  if (usePrime && typeof option.intr_rate2 === "number") return option.intr_rate2;
  if (typeof option.intr_rate === "number") return option.intr_rate;
  if (typeof option.intr_rate2 === "number") return option.intr_rate2;
  return 0;
}

export function ProductDetailDrawer({ open, onOpenChange, kind, product, amountWonDefault }: Props) {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [usePrimeRate, setUsePrimeRate] = useState(true);
  const [taxRate, setTaxRate] = useState(15.4);
  const [amountWon, setAmountWon] = useState(amountWonDefault > 0 ? amountWonDefault : 10_000_000);
  const [savingMonthlyWon, setSavingMonthlyWon] = useState(amountWonDefault > 0 ? amountWonDefault : 500_000);

  const config = FINLIFE_FIELD_CONFIG[kind];
  const notes = buildConsumerNotes(product.raw);
  const summary = getKindSummary(kind);
  const selectedOption = product.options[selectedOptionIndex] ?? product.options[0];

  const optionRows = useMemo(() => {
    return product.options.map((option) => {
      const bySpec = presentBySpecs(kind, option.raw, config?.optionFields);
      return bySpec.length ? bySpec : presentOptionFallback(kind, option.raw, 8);
    });
  }, [config?.optionFields, kind, product.options]);

  const calc = useMemo(() => {
    if (!selectedOption) return null;
    const months = parseTerm(selectedOption);
    const annualRatePct = pickRate(selectedOption, usePrimeRate);

    if (kind === "deposit") {
      return calcDeposit({
        principalWon: amountWon,
        months,
        annualRatePct,
        taxRatePct: taxRate,
        interestType: "simple",
      });
    }

    if (kind === "saving") {
      return calcSaving({
        monthlyPaymentWon: savingMonthlyWon,
        months,
        annualRatePct,
        taxRatePct: taxRate,
        interestType: "compound",
      });
    }

    return null;
  }, [amountWon, kind, savingMonthlyWon, selectedOption, taxRate, usePrimeRate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm p-4 md:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[2.5rem] bg-white shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
        <div className="p-8 lg:p-10 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{summary} 상세 정보</span>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{product.fin_prdt_nm ?? "상품 상세"}</h2>
            <p className="text-sm font-bold text-slate-500">{product.kor_co_nm ?? "-"}</p>
          </div>
          <Button variant="outline" className="rounded-2xl h-10 px-4 font-black" onClick={() => onOpenChange(false)}>닫기</Button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 lg:p-10 space-y-10 scrollbar-thin scrollbar-thumb-slate-200">
          <section className="space-y-4">
            <SubSectionHeader title="상품 안내" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {presentBySpecs(kind, product.raw, config?.productFields).map((entry) => (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4" key={`overview-${entry.label}`}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{entry.label}</p>
                  <p className="text-sm font-bold text-slate-700 leading-relaxed">{entry.valueText}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <SubSectionHeader title="우대조건 및 유의사항" />
            <div className="rounded-[2rem] border border-slate-100 bg-slate-50/30 p-6 lg:p-8">
              {notes.length === 0 ? (
                <p className="text-sm font-bold text-slate-400 italic text-center py-4">공시된 추가 유의사항 정보가 없습니다.</p>
              ) : (
                <ul className="space-y-4">
                  {notes.map((note) => (
                    <li key={note.label} className="flex items-start gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <p className="text-sm font-medium leading-relaxed text-slate-700">
                        <span className="font-black text-slate-900 mr-2">{note.label}</span>
                        {note.value}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <SubSectionHeader title="금리 및 기간 옵션" description="기간별 공시된 금리 정보입니다." />
            <div className="flex flex-wrap gap-2">
              {product.options.map((option, index) => (
                <button
                  key={`${product.fin_prdt_cd}-opt-chip-${index}`}
                  type="button"
                  onClick={() => setSelectedOptionIndex(index)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs font-black transition-all shadow-sm",
                    selectedOptionIndex === index
                      ? "border-emerald-200 bg-emerald-500 text-white shadow-emerald-100"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {option.save_trm ? formatGlossaryValue("save_trm", option.save_trm) : `옵션 ${index + 1}`}
                </button>
              ))}
            </div>

            <div className="rounded-[2rem] border border-slate-100 bg-white p-2 overflow-hidden shadow-inner">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm border-separate border-spacing-y-1">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-4 py-2">기간</th>
                      <th className="px-4 py-2">상세 옵션 정보</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.options.map((option, index) => {
                      const shown = optionRows[index] ?? [];
                      return (
                        <tr key={`${product.fin_prdt_cd}-opt-row-${index}`} className={cn("group transition-colors", selectedOptionIndex === index ? "bg-emerald-50/30" : "hover:bg-slate-50/50")}>
                          <td className="px-4 py-4 font-black text-slate-900 tabular-nums">
                            {option.save_trm ? formatGlossaryValue("save_trm", option.save_trm) : `옵션 ${index + 1}`}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              {shown.map((entry) => (
                                <span key={`${index}-${entry.label}`} className="inline-flex rounded-lg bg-white border border-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
                                  <span className="opacity-50 mr-1.5">{entry.label}</span>
                                  {entry.valueText}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {(kind === "deposit" || kind === "saving") && selectedOption && (
            <section className="space-y-6 rounded-[2.5rem] bg-slate-50 border border-slate-100 p-8 lg:p-10 shadow-sm">
              <SubSectionHeader
                title="금리 계산기"
                description="기본 세율 15.4% 기준 예상 수령액입니다."
              />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    {kind === "deposit" ? "예치금액" : "월 납입액"}
                  </label>
                  <div className="relative">
                    <input
                      className="h-11 w-full rounded-xl bg-white border border-slate-200 px-4 text-sm font-black text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500 transition-all tabular-nums shadow-sm"
                      value={(kind === "deposit" ? amountWon : savingMonthlyWon).toLocaleString()}
                      onChange={(e) => {
                        const val = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                        if (kind === "deposit") setAmountWon(val);
                        else setSavingMonthlyWon(val);
                      }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300">원</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">기간</label>
                  <input className="h-11 w-full rounded-xl bg-slate-100/50 border border-slate-100 px-4 text-sm font-black text-slate-400 outline-none tabular-nums" value={formatGlossaryValue("save_trm", String(parseTerm(selectedOption)))} readOnly />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">세율(%)</label>
                  <input className="h-11 w-full rounded-xl bg-white border border-slate-200 px-4 text-sm font-black text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500 transition-all tabular-nums shadow-sm" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">금리 기준</label>
                  <select className="h-11 w-full rounded-xl bg-white border border-slate-200 px-4 text-sm font-black text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" value={usePrimeRate ? "prime" : "base"} onChange={(e) => setUsePrimeRate(e.target.value === "prime") }>
                    <option value="base">기본금리</option>
                    <option value="prime">최고금리</option>
                  </select>
                </div>
              </div>

              {calc && (
                <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-8 border-t border-slate-200">
                  <div className="rounded-2xl bg-white p-4 border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">세전 이자</p>
                    <p className="mt-1 text-base font-black tabular-nums text-slate-700">{formatKrwWithEok(calc.grossInterestWon)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">이자 과세</p>
                    <p className="mt-1 text-base font-black tabular-nums text-rose-500">-{formatKrwWithEok(calc.taxWon)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">세후 이자</p>
                    <p className="mt-1 text-base font-black tabular-nums text-emerald-600">{formatKrwWithEok(calc.netInterestWon)}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-500 p-5 shadow-lg shadow-emerald-900/20">
                    <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">예상 수령액</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-white">{formatKrwWithEok(calc.maturityWon)}</p>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="p-8 lg:p-10 border-t border-slate-100 bg-slate-50/50 flex justify-center">
          <Button variant="outline" className="rounded-2xl h-12 px-12 font-black shadow-sm" onClick={() => onOpenChange(false)}>
            상품 상세 창 닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
