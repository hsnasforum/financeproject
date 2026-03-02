"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { calcDeposit, calcSaving } from "@/lib/finlife/calculators";
import { FINLIFE_FIELD_CONFIG } from "@/lib/finlife/fieldConfig";
import { buildConsumerNotes, formatGlossaryValue, getKindSummary } from "@/lib/finlife/glossary";
import { presentBySpecs, presentOptionFallback } from "@/lib/finlife/present";
import { formatKrwWithEok } from "@/lib/format/krw";
import { type FinlifeKind, type NormalizedOption, type NormalizedProduct } from "@/lib/finlife/types";

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
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/45 md:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white p-5 md:rounded-2xl md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{product.kor_co_nm ?? "-"}</p>
            <h3 className="text-lg font-semibold text-slate-900">{product.fin_prdt_nm ?? "상품 상세"}</h3>
            <p className="mt-1 text-xs text-slate-600">{summary}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>닫기</Button>
        </div>

        <details open className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">상품 안내</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {presentBySpecs(kind, product.raw, config?.productFields).map((entry) => (
              <div key={`overview-${entry.label}`} className="rounded border border-slate-100 bg-slate-50 p-2">
                <p className="text-[11px] font-semibold text-slate-600">{entry.label}</p>
                <p className="text-xs text-slate-800">{entry.valueText}</p>
              </div>
            ))}
          </div>
        </details>

        <details className="mt-3 rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">우대조건/유의사항</summary>
          {notes.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">공시된 우대조건/유의사항 정보가 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {notes.map((note) => (
                <li key={note.label}><span className="font-semibold">{note.label}</span>: {note.value}</li>
              ))}
            </ul>
          )}
        </details>

        <details open className="mt-3 rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">금리/옵션(기간별)</summary>
          {product.options.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">옵션 정보가 제공되지 않았습니다(공시 데이터 기준).</p>
          ) : (
            <div className="mt-2 space-y-3">
              <div className="flex flex-wrap gap-2">
                {product.options.map((option, index) => (
                  <button
                    key={`${product.fin_prdt_cd}-opt-chip-${index}`}
                    type="button"
                    onClick={() => setSelectedOptionIndex(index)}
                    className={`rounded-full border px-3 py-1 text-xs ${selectedOptionIndex === index ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}
                  >
                    {option.save_trm ? formatGlossaryValue("save_trm", option.save_trm) : `옵션 ${index + 1}`}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 pr-3 font-semibold">옵션</th>
                      <th className="py-1 pr-3 font-semibold">핵심 정보</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.options.map((option, index) => {
                      const shown = optionRows[index] ?? [];
                      return (
                        <tr key={`${product.fin_prdt_cd}-opt-row-${index}`} className="border-t border-slate-100 align-top">
                          <td className="py-2 pr-3 text-slate-700">
                            {option.save_trm ? formatGlossaryValue("save_trm", option.save_trm) : `옵션 ${index + 1}`}
                          </td>
                          <td className="py-2 pr-3">
                            {shown.length === 0 ? (
                              <span className="text-slate-500">옵션 정보가 제공되지 않았습니다(공시 데이터 기준).</span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {shown.map((entry) => (
                                  <span key={`${index}-${entry.label}`} className="rounded bg-slate-50 px-2 py-1 text-slate-700">
                                    <span className="font-semibold">{entry.label}</span>: {entry.valueText}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </details>

        {(kind === "deposit" || kind === "saving") && selectedOption ? (
          <details open className="mt-3 rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">금리 계산기</summary>
            <p className="mt-1 text-xs text-slate-500">
              가정값(기본 세율 15.4%) 기반 예상치입니다. 실제 수령액은 이자 지급 방식/세율/우대조건 충족 여부에 따라 달라질 수 있습니다.
            </p>

            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              {kind === "deposit" ? (
                <label className="text-xs">예치금(원)
                  <input className="mt-1 h-9 w-full rounded border border-slate-300 px-2" value={amountWon} onChange={(e) => setAmountWon(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} />
                </label>
              ) : (
                <label className="text-xs">월 납입액(원)
                  <input className="mt-1 h-9 w-full rounded border border-slate-300 px-2" value={savingMonthlyWon} onChange={(e) => setSavingMonthlyWon(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} />
                </label>
              )}
              <label className="text-xs">기간
                <input className="mt-1 h-9 w-full rounded border border-slate-300 px-2" value={formatGlossaryValue("save_trm", String(parseTerm(selectedOption)))} readOnly />
              </label>
              <label className="text-xs">세율(%)
                <input className="mt-1 h-9 w-full rounded border border-slate-300 px-2" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
              </label>
              <label className="text-xs">금리기준
                <select className="mt-1 h-9 w-full rounded border border-slate-300 px-2" value={usePrimeRate ? "prime" : "base"} onChange={(e) => setUsePrimeRate(e.target.value === "prime") }>
                  <option value="base">기본금리</option>
                  <option value="prime">최고금리</option>
                </select>
              </label>
            </div>

            {calc ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                <p>원금/납입원금: <span className="font-semibold">{formatKrwWithEok(calc.principalWon)}</span></p>
                <p>세전이자: <span className="font-semibold">{formatKrwWithEok(calc.grossInterestWon)}</span></p>
                <p>이자과세: <span className="font-semibold">{formatKrwWithEok(calc.taxWon)}</span></p>
                <p>세후이자: <span className="font-semibold">{formatKrwWithEok(calc.netInterestWon)}</span></p>
                <p className="sm:col-span-2">세후수령액(예상): <span className="font-semibold text-emerald-700">{formatKrwWithEok(calc.maturityWon)}</span></p>
              </div>
            ) : null}
          </details>
        ) : null}
      </div>
    </div>
  );
}
