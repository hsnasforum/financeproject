import { roundKrw } from "./roundingPolicy";
import { type CalcEvidence } from "./evidence";

const EPSILON = 1e-9;

export type AmortizationRow = {
  monthIndex: number;
  openingPrincipalKrw: number;
  interestKrw: number;
  paymentKrw: number;
  principalPaidKrw: number;
  closingPrincipalKrw: number;
};

export type AmortizationPayoffResult = {
  payoffMonths: number;
  totalInterestKrw: number;
  monthlyPaymentKrw: number;
  negativeAmortizationRisk: boolean;
};

export type EqualPaymentScheduleRow = {
  monthIndex: number;
  openingBalanceKrw: number;
  paymentKrw: number;
  interestKrw: number;
  principalPaidKrw: number;
  endBalanceKrw: number;
};

export type EqualPaymentScheduleResult = {
  paymentKrw: number;
  totalInterestKrw: number;
  totalPaidKrw: number;
  rows: EqualPaymentScheduleRow[];
  evidence: CalcEvidence;
};

function toFiniteOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPositiveInt(value: unknown, fallback = 1): number {
  const parsed = Math.trunc(toFiniteOrZero(value));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function normalizeAprPct(aprInput: number): number {
  const value = toFiniteOrZero(aprInput);
  if (Math.abs(value) <= 1) return value * 100;
  return value;
}

export function monthlyRateFromAprPct(aprPct: number): number {
  const normalizedAprPct = normalizeAprPct(aprPct);
  return normalizedAprPct / 100 / 12;
}

export function amortizingMonthlyPayment(principalKrw: number, aprPct: number, months: number): number {
  const principal = Math.max(0, toFiniteOrZero(principalKrw));
  const n = clampPositiveInt(months, 1);
  const monthlyRate = monthlyRateFromAprPct(aprPct);

  if (principal <= EPSILON) return 0;
  if (monthlyRate <= 0) return principal / n;
  const growth = (1 + monthlyRate) ** n;
  return (principal * monthlyRate * growth) / (growth - 1);
}

export function buildEqualPaymentSchedule(input: {
  principalKrw: number;
  aprPct: number;
  termMonths: number;
}): EqualPaymentScheduleResult {
  const principalKrw = Math.max(0, roundKrw(toFiniteOrZero(input.principalKrw)));
  const termMonths = clampPositiveInt(input.termMonths, 1);
  const aprPct = normalizeAprPct(toFiniteOrZero(input.aprPct));
  const monthlyRate = monthlyRateFromAprPct(aprPct);
  const paymentKrw = roundKrw(amortizingMonthlyPayment(principalKrw, aprPct, termMonths));

  if (principalKrw <= 0) {
    return {
      paymentKrw: 0,
      totalInterestKrw: 0,
      totalPaidKrw: 0,
      rows: [],
      evidence: {
        metric: "amortizationEqualPayment",
        formula: "paymentKrw = 0 (principal=0)",
        inputs: {
          principalKrw,
          aprPct,
          termMonths,
        },
        assumptions: [
          "원 단위 반올림(roundKrw)을 사용합니다.",
          "원금이 0원이면 스케줄은 비어 있습니다.",
        ],
      },
    };
  }

  const rows: EqualPaymentScheduleRow[] = [];
  let remaining = principalKrw;
  let totalInterestKrw = 0;
  let totalPaidKrw = 0;

  for (let monthIndex = 1; monthIndex <= termMonths; monthIndex += 1) {
    const openingBalanceKrw = remaining;
    const interestKrw = roundKrw(openingBalanceKrw * monthlyRate);

    let rowPaymentKrw = paymentKrw;
    let principalPaidKrw = Math.max(0, rowPaymentKrw - interestKrw);

    if (monthIndex === termMonths || principalPaidKrw >= openingBalanceKrw) {
      principalPaidKrw = openingBalanceKrw;
      rowPaymentKrw = interestKrw + principalPaidKrw;
    }

    const endBalanceKrw = Math.max(0, openingBalanceKrw - principalPaidKrw);
    rows.push({
      monthIndex,
      openingBalanceKrw,
      paymentKrw: rowPaymentKrw,
      interestKrw,
      principalPaidKrw,
      endBalanceKrw,
    });

    totalInterestKrw += interestKrw;
    totalPaidKrw += rowPaymentKrw;
    remaining = endBalanceKrw;
    if (remaining <= 0) break;
  }

  return {
    paymentKrw,
    totalInterestKrw,
    totalPaidKrw,
    rows,
    evidence: {
      metric: "amortizationEqualPayment",
      formula: "paymentRaw=P*r*(1+r)^n/((1+r)^n-1), interest_m=roundKrw(balance_{m-1}*r), principal_m=payment_m-interest_m; 마지막 회차는 잔액 0으로 보정",
      inputs: {
        principalKrw,
        aprPct,
        termMonths,
        monthlyRate,
      },
      assumptions: [
        "원 단위 반올림(roundKrw)을 사용합니다.",
        "동일 상환액(Equal payment) 기준이며 마지막 회차는 잔액이 정확히 0이 되도록 조정합니다.",
      ],
    },
  };
}

export function buildAmortizationSchedule(
  principalKrw: number,
  aprPct: number,
  months: number,
  extraPaymentKrw = 0,
): AmortizationRow[] {
  const principal = Math.max(0, toFiniteOrZero(principalKrw));
  const n = clampPositiveInt(months, 1);
  const extraPayment = Math.max(0, toFiniteOrZero(extraPaymentKrw));
  const monthlyRate = monthlyRateFromAprPct(aprPct);
  const monthlyPayment = amortizingMonthlyPayment(principal, aprPct, n);

  if (principal <= EPSILON) return [];

  const rows: AmortizationRow[] = [];
  let remain = principal;
  let month = 0;
  const maxMonths = n + 1200;

  while (remain > EPSILON && month < maxMonths) {
    month += 1;
    const opening = remain;
    const interest = opening * monthlyRate;
    const payment = monthlyPayment + extraPayment;
    const principalPaid = payment <= interest + EPSILON ? 0 : Math.min(opening, payment - interest);
    const closing = Math.max(0, opening - principalPaid);

    rows.push({
      monthIndex: month,
      openingPrincipalKrw: roundKrw(opening),
      interestKrw: roundKrw(interest),
      paymentKrw: roundKrw(payment),
      principalPaidKrw: roundKrw(principalPaid),
      closingPrincipalKrw: roundKrw(closing),
    });

    if (principalPaid <= EPSILON) break;
    remain = closing;
  }

  return rows;
}

export function simulateAmortizingPayoff(
  principalKrw: number,
  aprPct: number,
  months: number,
  extraPaymentKrw = 0,
): AmortizationPayoffResult {
  const principal = Math.max(0, toFiniteOrZero(principalKrw));
  const n = clampPositiveInt(months, 1);
  const extraPayment = Math.max(0, toFiniteOrZero(extraPaymentKrw));
  const monthlyRate = monthlyRateFromAprPct(aprPct);
  const monthlyPayment = amortizingMonthlyPayment(principal, aprPct, n);

  if (principal <= EPSILON) {
    return {
      payoffMonths: 0,
      totalInterestKrw: 0,
      monthlyPaymentKrw: roundKrw(monthlyPayment),
      negativeAmortizationRisk: false,
    };
  }

  let remain = principal;
  let month = 0;
  let totalInterest = 0;
  let negativeAmortizationRisk = false;
  const maxMonths = n + 1200;

  while (remain > EPSILON && month < maxMonths) {
    month += 1;
    const interest = remain * monthlyRate;
    const payment = monthlyPayment + extraPayment;
    if (payment <= interest + EPSILON) {
      negativeAmortizationRisk = true;
      break;
    }

    const principalPaid = Math.min(remain, payment - interest);
    remain -= principalPaid;
    totalInterest += interest;
  }

  if (remain > EPSILON && !negativeAmortizationRisk) {
    negativeAmortizationRisk = true;
  }

  return {
    payoffMonths: month,
    totalInterestKrw: roundKrw(totalInterest),
    monthlyPaymentKrw: roundKrw(monthlyPayment),
    negativeAmortizationRisk,
  };
}
