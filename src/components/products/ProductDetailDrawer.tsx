"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { calcDeposit, calcSaving } from "@/lib/planning/calc";
import { FINLIFE_FIELD_CONFIG } from "@/lib/finlife/fieldConfig";
import { buildConsumerNotes, formatGlossaryValue, getKindSummary } from "@/lib/finlife/glossary";
import { presentBySpecs } from "@/lib/finlife/present";
import { ProductDisclosureMeta } from "@/components/products/ProductDisclosureMeta";
import { formatKrwWithEok } from "@/lib/format/krw";
import { type FinlifeKind, type NormalizedProduct } from "@/lib/finlife/types";
import {
  buildProductDetailOptionRows,
  buildProductDetailOptionSelectionLabels,
  pickProductDetailRate,
  resolveProductDetailOptionKey,
  type ProductDetailOptionSelection,
} from "@/lib/finlife/productDetailOption";
import { cn } from "@/lib/utils";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FinlifeKind;
  product: NormalizedProduct;
  amountWonDefault: number;
  initialOption?: ProductDetailOptionSelection | null;
  collectedAt?: string | null;
};

export function ProductDetailDrawer({ open, onOpenChange, kind, product, amountWonDefault, initialOption, collectedAt }: Props) {
  const [usePrimeRate, setUsePrimeRate] = useState(true);
  const [taxRate, setTaxRate] = useState(15.4);
  const [amountWon, setAmountWon] = useState(amountWonDefault > 0 ? amountWonDefault : 10_000_000);
  const [savingMonthlyWon, setSavingMonthlyWon] = useState(amountWonDefault > 0 ? amountWonDefault : 500_000);

  const config = FINLIFE_FIELD_CONFIG[kind];
  const notes = buildConsumerNotes(product.raw);
  const summary = getKindSummary(kind);

  const optionRows = useMemo(() => {
    return buildProductDetailOptionRows({
      kind,
      options: product.options,
      optionFields: config?.optionFields,
    });
  }, [config?.optionFields, kind, product.options]);
  const initialOptionKey = useMemo(
    () => resolveProductDetailOptionKey(optionRows, initialOption),
    [initialOption, optionRows],
  );
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(() => initialOptionKey);
  const optionSelectionLabels = useMemo(
    () => buildProductDetailOptionSelectionLabels(optionRows),
    [optionRows],
  );

  useEffect(() => {
    setSelectedOptionKey(initialOptionKey);
  }, [initialOptionKey]);

  const selectedOptionRow = optionRows.find((row) => row.key === selectedOptionKey) ?? optionRows[0];
  const selectedRateBasis = selectedOptionRow
    ? usePrimeRate && selectedOptionRow.primeRatePct !== null
      ? "prime"
      : !usePrimeRate && selectedOptionRow.baseRatePct !== null
        ? "base"
        : selectedOptionRow.primeRatePct !== null
          ? "prime"
          : selectedOptionRow.baseRatePct !== null
            ? "base"
            : null
    : null;

  const calc = useMemo(() => {
    if (
      !selectedOptionRow
      || !selectedOptionRow.isCalculable
      || selectedOptionRow.termMonths === null
      || selectedOptionRow.interestType === null
      || selectedRateBasis === null
    ) return null;
    const months = selectedOptionRow.termMonths;
    const annualRatePct = pickProductDetailRate(selectedOptionRow, selectedRateBasis);
    if (annualRatePct === null) return null;

    if (kind === "deposit") {
      return calcDeposit({
        principalWon: amountWon,
        months,
        annualRatePct,
        taxRatePct: taxRate,
        interestType: selectedOptionRow.interestType,
      });
    }

    if (kind === "saving") {
      return calcSaving({
        monthlyPaymentWon: savingMonthlyWon,
        months,
        annualRatePct,
        taxRatePct: taxRate,
        interestType: selectedOptionRow.interestType,
      });
    }

    return null;
  }, [amountWon, kind, savingMonthlyWon, selectedOptionRow, selectedRateBasis, taxRate]);

  if (!open) return null;

  return (
    <AccessibleDialog
      labelledBy="product-detail-title"
      describedBy="product-detail-description"
      onClose={() => onOpenChange(false)}
      overlayClassName="z-[70] items-end bg-slate-900/40 backdrop-blur-sm p-4 md:items-center"
      panelClassName="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[2.5rem] bg-white shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 duration-300"
    >
        <div className="p-8 lg:p-10 border-b border-slate-100 flex items-start justify-between bg-surface-muted/50">
          <div className="space-y-2">
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">{summary} 상세 정보</span>
            <h2 id="product-detail-title" className="text-2xl font-black text-navy tracking-tight leading-tight">{product.fin_prdt_nm ?? "상품 상세"}</h2>
            <p className="text-sm font-bold text-slate-500">{product.kor_co_nm ?? "-"}</p>
            <ProductDisclosureMeta disclosureMonth={product.raw.dcls_month} collectedAt={collectedAt} />
            <p id="product-detail-description" className="max-w-2xl text-xs font-medium leading-relaxed text-slate-500">
              이 창은 확정 추천이 아니라, 현재 비교 기준으로 금리, 가입 조건, 우대사항을 다시 확인하는 단계입니다.
            </p>
          </div>
          <Button data-dialog-initial-focus variant="outline" className="rounded-2xl h-10 px-4 font-black" onClick={() => onOpenChange(false)}>닫기</Button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 lg:p-10 space-y-10 scrollbar-thin scrollbar-thumb-slate-200">
          <section className="space-y-4">
            <SubSectionHeader title="상품 안내" description="현재 비교 기준에서 먼저 읽어야 할 기본 조건과 공시 정보입니다." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {presentBySpecs(kind, product.raw, config?.productFields).map((entry) => (
                <div className="rounded-2xl border border-slate-100 bg-surface-muted/50 p-4" key={`overview-${entry.label}`}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{entry.label}</p>
                  <p className="text-sm font-bold text-slate-700 leading-relaxed">{entry.valueText}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <SubSectionHeader title="다음 확인 포인트" description="실제 가입 전에 다시 볼 우대조건과 제한 사항입니다." />
            <div className="rounded-[2rem] border border-slate-100 bg-surface-muted/30 p-6 lg:p-8">
              {notes.length === 0 ? (
                <p className="text-sm font-bold text-slate-400 italic text-center py-4">공시된 추가 유의사항 정보가 없습니다.</p>
              ) : (
                <ul className="space-y-4">
                  {notes.map((note) => (
                    <li key={note.label} className="flex items-start gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <p className="text-sm font-medium leading-relaxed text-slate-700">
                        <span className="font-black text-navy mr-2">{note.label}</span>
                        {note.value}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <SubSectionHeader title="금리 및 기간 옵션" description="현재 비교 중인 후보의 기간별 공시 옵션입니다." />
            {optionRows.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-surface-muted/50 px-5 py-6 text-center text-sm font-bold text-slate-500">
                현재 공시 옵션을 확인하지 못했습니다.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {optionRows.map((row, index) => (
                    <button
                      key={`${product.fin_prdt_cd}-opt-chip-${row.key}`}
                      type="button"
                      aria-pressed={selectedOptionRow?.key === row.key}
                      data-option-key={row.key}
                      onClick={() => setSelectedOptionKey(row.key)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-xs font-black transition-all shadow-sm",
                        selectedOptionRow?.key === row.key
                          ? "border-primary/20 bg-primary text-white shadow-primary/10"
                          : "border-slate-200 bg-white text-slate-500 hover:bg-surface-muted"
                      )}
                    >
                      {optionSelectionLabels[index]}
                    </button>
                  ))}
                </div>

                <div className="space-y-3 md:hidden" data-option-mobile-list>
                  {optionRows.map((row, index) => (
                    <article
                      key={`${product.fin_prdt_cd}-opt-mobile-${row.key}`}
                      className={cn(
                        "min-w-0 overflow-hidden rounded-2xl border p-4",
                        selectedOptionRow?.key === row.key
                          ? "border-primary/20 bg-primary/10"
                          : "border-slate-200 bg-white",
                      )}
                      data-option-mobile-card
                      data-selected={selectedOptionRow?.key === row.key ? "true" : "false"}
                    >
                      <p className="text-sm font-black text-navy tabular-nums">
                        {optionSelectionLabels[index]}
                      </p>
                      {row.detailEntries.length === 0 ? (
                        <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">상세 옵션 정보를 확인하지 못했습니다.</p>
                      ) : (
                        <dl className="mt-3 space-y-2">
                          {row.detailEntries.map((entry) => (
                            <div
                              className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3"
                              data-option-field={entry.label}
                              data-option-value={entry.valueText}
                              key={`${row.key}-mobile-${entry.label}`}
                            >
                              <dt className="min-w-0 break-words text-[11px] font-bold text-slate-400">{entry.label}</dt>
                              <dd className="min-w-0 break-words text-xs font-bold text-slate-700">{entry.valueText}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </article>
                  ))}
                </div>

                <div className="hidden rounded-[2rem] border border-slate-100 bg-white p-2 shadow-inner md:block" data-option-desktop-table>
                  <div className="overflow-x-auto" data-option-desktop-scroll>
                    <table className="min-w-full text-left text-sm border-separate border-spacing-y-1">
                      <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-4 py-2">기간</th>
                          <th className="px-4 py-2">상세 옵션 정보</th>
                        </tr>
                      </thead>
                      <tbody>
                        {optionRows.map((row, index) => (
                          <tr
                            key={`${product.fin_prdt_cd}-opt-row-${row.key}`}
                            className={cn("group transition-colors", selectedOptionRow?.key === row.key ? "bg-primary/30" : "hover:bg-surface-muted/50")}
                            data-selected={selectedOptionRow?.key === row.key ? "true" : "false"}
                          >
                            <td className="px-4 py-4 font-black text-navy tabular-nums">
                              {optionSelectionLabels[index]}
                            </td>
                            <td className="min-w-0 px-4 py-4">
                              {row.detailEntries.length === 0 ? (
                                <p className="text-xs font-medium text-slate-500">상세 옵션 정보를 확인하지 못했습니다.</p>
                              ) : (
                                <div className="flex min-w-0 flex-wrap gap-2">
                                  {row.detailEntries.map((entry) => (
                                    <span
                                      key={`${row.key}-${entry.label}`}
                                      className="inline-flex min-w-0 max-w-full rounded-lg bg-white border border-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 shadow-sm"
                                      data-option-field={entry.label}
                                      data-option-value={entry.valueText}
                                    >
                                      <span className="mr-1.5 shrink-0 opacity-50">{entry.label}</span>
                                      <span className="min-w-0 break-words">{entry.valueText}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>

          {(kind === "deposit" || kind === "saving") && selectedOptionRow && (
            <section
              className="space-y-6 rounded-[2.5rem] bg-surface-muted border border-slate-100 p-8 lg:p-10 shadow-sm"
              data-selected-option-key={selectedOptionRow.key}
              data-selected-option-rate={selectedRateBasis ? pickProductDetailRate(selectedOptionRow, selectedRateBasis) ?? "missing" : "missing"}
              data-selected-option-term={selectedOptionRow.termMonths ?? "missing"}
              data-selected-option-interest-type={selectedOptionRow.interestType ?? "missing"}
            >
              <SubSectionHeader
                title="금리 계산기"
                description="입력한 금액과 세율 가정에 공시된 이자 계산 방식을 반영한 비교값입니다."
              />

              {!selectedOptionRow.isCalculable ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5" role="status">
                  <p className="text-sm font-black text-amber-900">계산 기준을 확인하지 못했습니다.</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
                    {selectedOptionRow.missing.map((missing) => {
                      if (missing === "term") return "기간 정보";
                      if (missing === "rate") return "적용 가능한 금리 정보";
                      return "이자 계산 방식";
                    }).join(" · ")}가 없어 예상 금액을 계산하지 않았습니다. 상품 공시나 금융사 안내에서 기준을 다시 확인해 주세요.
                  </p>
                </div>
              ) : (
                <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    {kind === "deposit" ? "예치금액" : "월 납입액"}
                  </label>
                  <div className="relative">
                    <input
                      className="h-11 w-full rounded-xl bg-white border border-slate-200 px-4 text-sm font-black text-slate-700 outline-none focus:ring-1 focus:ring-primary transition-all tabular-nums shadow-sm"
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
                  <input className="h-11 w-full rounded-xl bg-surface-muted/50 border border-slate-100 px-4 text-sm font-black text-slate-400 outline-none tabular-nums" value={formatGlossaryValue("save_trm", String(selectedOptionRow.termMonths))} readOnly />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">세율(%)</label>
                  <input className="h-11 w-full rounded-xl bg-white border border-slate-200 px-4 text-sm font-black text-slate-700 outline-none focus:ring-1 focus:ring-primary transition-all tabular-nums shadow-sm" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">금리 기준</label>
                  <select className="h-11 w-full rounded-xl bg-white border border-slate-200 px-4 text-sm font-black text-slate-700 outline-none focus:ring-1 focus:ring-primary transition-all shadow-sm" value={selectedRateBasis ?? ""} onChange={(e) => setUsePrimeRate(e.target.value === "prime") }>
                    {selectedOptionRow.baseRatePct !== null ? <option value="base">기본금리</option> : null}
                    {selectedOptionRow.primeRatePct !== null ? <option value="prime">최고금리</option> : null}
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
                    <p className="mt-1 text-base font-black tabular-nums text-primary">{formatKrwWithEok(calc.netInterestWon)}</p>
                  </div>
                  <div className="rounded-2xl bg-primary p-5 shadow-lg shadow-navy/20">
                    <p className="text-[10px] font-black text-navy uppercase tracking-widest">예상 수령액</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-white">{formatKrwWithEok(calc.maturityWon)}</p>
                  </div>
                </div>
              )}
                </>
              )}
            </section>
          )}
        </div>

        <div className="p-8 lg:p-10 border-t border-slate-100 bg-surface-muted/50 flex justify-center">
          <Button variant="outline" className="rounded-2xl h-12 px-12 font-black shadow-sm" onClick={() => onOpenChange(false)}>
            상품 상세 창 닫기
          </Button>
        </div>
    </AccessibleDialog>
  );
}
