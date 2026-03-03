import { describe, expect, it } from "vitest";
import { POST as importCsvPost } from "../src/app/api/planning/v3/import/csv/route";

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestJson(body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/import/csv`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/import`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/planning/v3/import/csv mapping validation", () => {
  it("returns 400 when mapping keys are not in csv headers", async () => {
    const csv = [
      "when,value,memo",
      "2026-03-01,1000000,salary",
    ].join("\n");

    const response = await importCsvPost(requestJson({
      csvText: csv,
      mapping: {
        dateKey: "date",
        amountKey: "amount",
      },
    }));

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: { code?: string } };
    expect(payload.error?.code).toBe("INPUT");
  });

  it("returns 400 when amountKey is missing and inflow/outflow pair is incomplete", async () => {
    const csv = [
      "when,income,outcome",
      "2026-03-01,1000000,0",
    ].join("\n");

    const response = await importCsvPost(requestJson({
      csvText: csv,
      mapping: {
        dateKey: "when",
        inflowKey: "income",
      },
    }));

    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: { code?: string } };
    expect(payload.error?.code).toBe("INPUT");
  });
});
