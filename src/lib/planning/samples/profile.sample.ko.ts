import { type ProfileV2 } from "../v2/types";

export const SAMPLE_PROFILE_V2_KO_NAME = "샘플 프로필 (가상)";

export const SAMPLE_PROFILE_V2_KO: ProfileV2 = {
  currentAge: 39,
  monthlyIncomeNet: 4_600_000,
  monthlyEssentialExpenses: 1_850_000,
  monthlyDiscretionaryExpenses: 900_000,
  liquidAssets: 8_200_000,
  investmentAssets: 12_500_000,
  debts: [
    {
      id: "loan-home",
      name: "주택담보대출",
      balance: 180_000_000,
      minimumPayment: 850_000,
      aprPct: 4.2,
      remainingMonths: 240,
      repaymentType: "amortizing",
    },
  ],
  goals: [
    {
      id: "emergency-6m",
      name: "비상금 6개월",
      targetAmount: 18_000_000,
      currentAmount: 8_200_000,
      targetMonth: 24,
      priority: 1,
      minimumMonthlyContribution: 250_000,
    },
    {
      id: "education-fund",
      name: "교육비 목돈",
      targetAmount: 30_000_000,
      currentAmount: 3_000_000,
      targetMonth: 84,
      priority: 2,
      minimumMonthlyContribution: 220_000,
    },
  ],
  cashflow: {
    monthlyIncomeKrw: 4_600_000,
    monthlyFixedExpensesKrw: 1_850_000,
    monthlyVariableExpensesKrw: 900_000,
    phases: [
      {
        id: "work",
        title: "재직",
        range: { startMonth: 0, endMonth: 251 },
        monthlyIncomeKrw: 4_600_000,
        monthlyFixedExpensesKrw: 1_850_000,
        monthlyVariableExpensesKrw: 900_000,
      },
      {
        id: "retired",
        title: "은퇴 이후",
        range: { startMonth: 252, endMonth: 359 },
        monthlyIncomeKrw: 0,
        monthlyFixedExpensesKrw: 1_500_000,
        monthlyVariableExpensesKrw: 600_000,
      },
    ],
    pensions: [
      {
        id: "national-pension",
        title: "국민연금 수령",
        range: { startMonth: 252, endMonth: 359 },
        monthlyPayoutKrw: 950_000,
      },
    ],
    contributions: [
      {
        id: "monthly-invest",
        title: "월 적립식 투자",
        range: { startMonth: 0, endMonth: 251 },
        from: "cash",
        to: "investments",
        monthlyAmountKrw: 300_000,
      },
    ],
    rules: {
      phaseOverlapPolicy: "sum",
    },
  },
};
