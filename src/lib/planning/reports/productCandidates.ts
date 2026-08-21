import { calcDeposit, calcSaving } from "../calc";
import { type NormalizedOption, type NormalizedProduct } from "../../finlife/types";
import {
  parseProductDetailInterestType,
  parseProductDetailTerm,
} from "../../finlife/productDetailOption";

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
  selectedOption: NormalizedOption;
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
  return parseProductDetailTerm(value) ?? undefined;
}

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "ko");
}

export function pickRateFromOption(
  option: Pick<NormalizedOption, "intr_rate" | "intr_rate2"> | undefined,
  usePrimeRate: boolean,
): number | null {
  if (!option) return null;
  const requested = usePrimeRate ? option.intr_rate2 : option.intr_rate;
  return typeof requested === "number" && Number.isFinite(requested) ? requested : null;
}

function findPreferredOption(
  product: NormalizedProduct,
  termMonths: number,
  usePrimeRate: boolean,
): NormalizedOption | undefined {
  const hasCalculationInputs = (option: NormalizedOption) => (
    parseTermMonths(option.save_trm) !== undefined
    && pickRateFromOption(option, usePrimeRate) !== null
    && parseProductDetailInterestType(option) !== null
  );
  const exactOptions = product.options.filter((option) => parseTermMonths(option.save_trm) === termMonths);
  const exactAvailable = exactOptions.find(hasCalculationInputs);
  if (exactAvailable) return exactAvailable;

  const best = product.best;
  const matchingBest = best
    ? product.options.find((option) => {
        if (best.save_trm && option.save_trm !== best.save_trm) return false;
        if (typeof best.intr_rate === "number" && option.intr_rate !== best.intr_rate) return false;
        if (typeof best.intr_rate2 === "number" && option.intr_rate2 !== best.intr_rate2) return false;
        return Boolean(best.save_trm) || typeof best.intr_rate === "number" || typeof best.intr_rate2 === "number";
      })
    : undefined;
  if (matchingBest && hasCalculationInputs(matchingBest)) return matchingBest;

  const firstAvailable = product.options.find(hasCalculationInputs);
  return firstAvailable ?? exactOptions[0] ?? matchingBest ?? product.options[0];
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

  const rows = products.flatMap((product): CandidateRow[] => {
    const selectedOption = findPreferredOption(product, controls.termMonths, controls.usePrimeRate);
    const effectiveTerm = parseTermMonths(selectedOption?.save_trm);
    const annualRatePct = pickRateFromOption(selectedOption, controls.usePrimeRate);
    const interestType = selectedOption ? parseProductDetailInterestType(selectedOption) : null;
    if (!selectedOption || effectiveTerm === undefined || annualRatePct === null || interestType === null) return [];
    const calc = kind === "deposit"
      ? calcDeposit({
        principalWon: controls.depositPrincipalWon,
        months: effectiveTerm,
        annualRatePct,
        taxRatePct: controls.taxRatePct,
        interestType,
      })
      : calcSaving({
        monthlyPaymentWon: controls.savingMonthlyPaymentWon,
        months: effectiveTerm,
        annualRatePct,
        taxRatePct: controls.taxRatePct,
        interestType,
      });

    return [{
      providerName: product.kor_co_nm?.trim() || "-",
      productName: product.fin_prdt_nm?.trim() || product.fin_prdt_cd,
      termMonths: effectiveTerm,
      annualRatePct,
      netInterestWon: calc.netInterestWon,
      maturityWon: calc.maturityWon,
      product,
      selectedOption,
    } satisfies CandidateRow];
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
