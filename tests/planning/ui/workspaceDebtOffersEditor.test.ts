import { describe, expect, it } from "vitest";
import {
  debtOfferRowsToPayload,
  parseDebtOffersEditorJson,
  parseDebtOffersFormRows,
} from "../../../src/app/planning/_lib/workspaceDebtOffersEditor";

describe("workspaceDebtOffersEditor", () => {
  it("parses debt offer rows from raw json array", () => {
    const rows = parseDebtOffersFormRows([
      {
        liabilityId: "loan-1",
        title: "Refi A",
        newAprPct: 5.4,
        feeKrw: 90_000,
      },
      {
        liabilityId: "loan-2",
      },
    ]);

    expect(rows).toEqual([
      {
        rowId: "offer-1",
        liabilityId: "loan-1",
        title: "Refi A",
        newAprPct: 5.4,
        feeKrw: 90_000,
      },
      {
        rowId: "offer-2",
        liabilityId: "loan-2",
        title: "",
        newAprPct: 0,
        feeKrw: 0,
      },
    ]);
  });

  it("builds payload rows and drops blank liability ids", () => {
    const payload = debtOfferRowsToPayload([
      {
        rowId: "offer-1",
        liabilityId: "loan-1",
        title: "Refi A",
        newAprPct: 5.4,
        feeKrw: 90_000,
      },
      {
        rowId: "offer-2",
        liabilityId: " ",
        title: "Ignored",
        newAprPct: 4.8,
        feeKrw: 50_000,
      },
    ]);

    expect(payload).toEqual([
      {
        liabilityId: "loan-1",
        title: "Refi A",
        newAprPct: 5.4,
        feeKrw: 90_000,
      },
    ]);
  });

  it("parses editor json or returns a stable error", () => {
    const parsed = parseDebtOffersEditorJson(JSON.stringify([
      {
        liabilityId: "loan-1",
        title: "Refi A",
        newAprPct: 5.4,
        feeKrw: 90_000,
      },
    ]));
    const invalid = parseDebtOffersEditorJson("{invalid-json");

    expect(parsed).toMatchObject({
      ok: true,
      rows: [
        {
          rowId: "offer-1",
          liabilityId: "loan-1",
          title: "Refi A",
          newAprPct: 5.4,
          feeKrw: 90_000,
        },
      ],
    });
    expect(invalid).toEqual({
      ok: false,
      error: "리파이낸스 제안 JSON 파싱 실패: 형식을 확인하세요.",
    });
  });
});
