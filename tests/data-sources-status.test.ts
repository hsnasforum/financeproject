import { describe, expect, it } from "vitest";
import { getDataSourceStatuses } from "../src/lib/dataSources/registry";

describe("data source registry status", () => {
  it("returns missing state when required env is not configured", () => {
    const backup = process.env.EXIM_EXCHANGE_API_KEY;
    delete process.env.EXIM_EXCHANGE_API_KEY;
    const statuses = getDataSourceStatuses();
    const exim = statuses.find((entry) => entry.id === "EXIM_EXCHANGE");

    expect(exim?.status.state).toBe("missing");

    if (typeof backup === "string") process.env.EXIM_EXCHANGE_API_KEY = backup;
    else delete process.env.EXIM_EXCHANGE_API_KEY;
  });
});
