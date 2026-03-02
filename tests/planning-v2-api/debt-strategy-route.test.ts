import { describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/planning/v2/debt-strategy/route";

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/planning/v2/debt-strategy", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/planning",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function profileFixture() {
  return {
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_500_000,
    investmentAssets: 5_000_000,
    debts: [
      {
        id: "loan-1",
        name: "Loan 1",
        balance: 12_000_000,
        minimumPayment: 360_000,
        aprPct: 7.5,
        remainingMonths: 48,
        repaymentType: "amortizing",
      },
    ],
    goals: [],
  };
}

describe("POST /api/planning/v2/debt-strategy", () => {
  it("returns ok response for valid input", async () => {
    const response = await POST(request({
      profile: profileFixture(),
      offers: [
        {
          liabilityId: "loan-1",
          newAprPct: 5.4,
          feeKrw: 90_000,
        },
      ],
      options: {
        extraPaymentKrw: 100_000,
      },
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        meta?: { debtServiceRatio?: number; totalMonthlyPaymentKrw?: number };
        summaries?: unknown[];
        refinance?: unknown[];
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.meta?.debtServiceRatio).toBeGreaterThan(0);
    expect(payload.data?.meta?.totalMonthlyPaymentKrw).toBeGreaterThan(0);
    expect((payload.data?.summaries ?? []).length).toBe(1);
    expect((payload.data?.refinance ?? []).length).toBe(1);
  });

  it("returns INPUT error when offer fee is negative", async () => {
    const response = await POST(request({
      profile: profileFixture(),
      offers: [
        {
          liabilityId: "loan-1",
          newAprPct: 5.4,
          feeKrw: -1,
        },
      ],
    }));
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; issues?: string[] };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect(payload.error?.issues?.some((issue) => issue.includes("offers[0].feeKrw"))).toBe(true);
  });

  it("returns INPUT error when offer liabilityId does not match debt ids", async () => {
    const response = await POST(request({
      profile: profileFixture(),
      offers: [
        {
          liabilityId: "loan-x",
          newAprPct: 5.4,
        },
      ],
    }));
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; issues?: string[] };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect(payload.error?.issues?.some((issue) => issue.includes("DEBT_OFFER_ID_MISMATCH"))).toBe(true);
    expect(payload.error?.issues?.some((issue) => issue.includes("expected ids: loan-1"))).toBe(true);
  });
});
