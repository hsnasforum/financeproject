import { calcDeposit, calcSaving } from "../calc";
import { type NormalizedOption, type NormalizedProduct } from "../../finlife/types";

export type CandidateKind = "deposit" | "saving";

export type CandidateSortKey = "rateDesc" | "maturityDesc" | "netInterestDesc" | "nameAsc";

export type CandidateControls = {
  termMonths: number;
  usePrimeRate: boolean;
  taxRatePct: number;
  depositPrincipalWon: number;
  savingMonthlyPaymentWon: number;
  sortKey: CandidateSortKey;
};

export type CandidateRow = {
  providerName: string;
  productName: string;
  termMonths: number;
  annualRatePct: number;
  netInterestWon: number;
  maturityWon: number;
  product: NormalizedProduct;
};

const DEFAULT_CONTROLS: CandidateControls = {
  termMonths: 12,
  usePrimeRate: true,
  taxRatePct: 15.4,
  depositPrincipalWon: 10_000_000,
  savingMonthlyPaymentWon: 500_000,
  sortKey: "maturityDesc",
};

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTermMonths(value: unknown): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = Number(raw.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.trunc(parsed);
}

function optionFromBest(product: NormalizedProduct): NormalizedOption | undefined {
  const best = product.best;
  if (!best) return undefined;
  return {
    save_trm: best.save_trm,
    intr_rate: typeof best.intr_rate === "number" ? best.intr_rate : null,
    intr_rate2: typeof best.intr_rate2 === "number" ? best.intr_rate2 : null,
    raw: product.raw,
  };
}

function findPreferredOption(product: NormalizedProduct, termMonths: number): NormalizedOption | undefined {
  const exact = product.options.find((option) => parseTermMonths(option.save_trm) === termMonths);
  if (exact) return exact;
  return optionFromBest(product) ?? product.options[0];
}

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "ko");
}

export function pickRateFromOption(
  option: Pick<NormalizedOption, "intr_rate" | "intr_rate2"> | undefined,
  usePrimeRate: boolean,
): number {
  if (!option) return 0;
  if (usePrimeRate && typeof option.intr_rate2 === "number" && Number.isFinite(option.intr_rate2)) {
    return option.intr_rate2;
  }
  if (typeof option.intr_rate === "number" && Number.isFinite(option.intr_rate)) {
    return option.intr_rate;
  }
  if (typeof option.intr_rate2 === "number" && Number.isFinite(option.intr_rate2)) {
    return option.intr_rate2;
  }
  return 0;
}

export function buildProductCandidateRows(
  kind: CandidateKind,
  products: NormalizedProduct[],
  inputControls?: Partial<CandidateControls>,
): CandidateRow[] {
  const controls: CandidateControls = {
    ...DEFAULT_CONTROLS,
    ...inputControls,
    termMonths: Math.max(1, Math.trunc(normalizeNumber(inputControls?.termMonths, DEFAULT_CONTROLS.termMonths))),
    taxRatePct: Math.max(0, normalizeNumber(inputControls?.taxRatePct, DEFAULT_CONTROLS.taxRatePct)),
    depositPrincipalWon: Math.max(0, Math.trunc(normalizeNumber(inputControls?.depositPrincipalWon, DEFAULT_CONTROLS.depositPrincipalWon))),
    savingMonthlyPaymentWon: Math.max(0, Math.trunc(normalizeNumber(inputControls?.savingMonthlyPaymentWon, DEFAULT_CONTROLS.savingMonthlyPaymentWon))),
  };

  const rows = products.map((product) => {
    const selectedOption = findPreferredOption(product, controls.termMonths);
    const effectiveTerm = parseTermMonths(selectedOption?.save_trm) ?? controls.termMonths;
    const annualRatePct = pickRateFromOption(selectedOption, controls.usePrimeRate);
    const calc = kind === "deposit"
      ? calcDeposit({
        principalWon: controls.depositPrincipalWon,
        months: effectiveTerm,
        annualRatePct,
        taxRatePct: controls.taxRatePct,
        interestType: "simple",
      })
      : calcSaving({
        monthlyPaymentWon: controls.savingMonthlyPaymentWon,
        months: effectiveTerm,
        annualRatePct,
        taxRatePct: controls.taxRatePct,
        interestType: "compound",
      });

    return {
      providerName: product.kor_co_nm?.trim() || "-",
      productName: product.fin_prdt_nm?.trim() || product.fin_prdt_cd,
      termMonths: effectiveTerm,
      annualRatePct,
      netInterestWon: calc.netInterestWon,
      maturityWon: calc.maturityWon,
      product,
    } satisfies CandidateRow;
  });

  rows.sort((left, right) => {
    switch (controls.sortKey) {
      case "rateDesc":
        return (right.annualRatePct - left.annualRatePct) || cmpText(left.productName, right.productName);
      case "netInterestDesc":
        return (right.netInterestWon - left.netInterestWon) || cmpText(left.productName, right.productName);
      case "nameAsc":
        return cmpText(left.productName, right.productName);
      case "maturityDesc":
      default:
        return (right.maturityWon - left.maturityWon) || cmpText(left.productName, right.productName);
    }
  });

  return rows;
}
