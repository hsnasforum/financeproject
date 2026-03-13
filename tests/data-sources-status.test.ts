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

  it("marks optional-only sources as missing when no key is configured", () => {
    const backups = {
      NPS_PENSION_API_KEY: process.env.NPS_PENSION_API_KEY,
      NPS_PENSION_API_URL: process.env.NPS_PENSION_API_URL,
    };
    delete process.env.NPS_PENSION_API_KEY;
    delete process.env.NPS_PENSION_API_URL;

    const statuses = getDataSourceStatuses();
    const nps = statuses.find((entry) => entry.id === "NPS");

    expect(nps?.status.state).toBe("missing");
    expect(nps?.status.message).toContain("NPS_PENSION_API_KEY");

    if (typeof backups.NPS_PENSION_API_KEY === "string") process.env.NPS_PENSION_API_KEY = backups.NPS_PENSION_API_KEY;
    else delete process.env.NPS_PENSION_API_KEY;
    if (typeof backups.NPS_PENSION_API_URL === "string") process.env.NPS_PENSION_API_URL = backups.NPS_PENSION_API_URL;
    else delete process.env.NPS_PENSION_API_URL;
  });

  it("includes FRED and KOSIS when optional env is configured", () => {
    const backups = {
      FRED_API_KEY: process.env.FRED_API_KEY,
      KOSIS_API_KEY: process.env.KOSIS_API_KEY,
    };
    process.env.FRED_API_KEY = "fred-test";
    process.env.KOSIS_API_KEY = "kosis-test";

    const statuses = getDataSourceStatuses();
    const fred = statuses.find((entry) => entry.id === "FRED");
    const kosis = statuses.find((entry) => entry.id === "KOSIS");

    expect(fred?.status.state).toBe("configured");
    expect(kosis?.status.state).toBe("configured");

    if (typeof backups.FRED_API_KEY === "string") process.env.FRED_API_KEY = backups.FRED_API_KEY;
    else delete process.env.FRED_API_KEY;
    if (typeof backups.KOSIS_API_KEY === "string") process.env.KOSIS_API_KEY = backups.KOSIS_API_KEY;
    else delete process.env.KOSIS_API_KEY;
  });

  it("treats ECOS alias as configured for BOK_ECOS", () => {
    const backups = {
      BOK_ECOS_API_KEY: process.env.BOK_ECOS_API_KEY,
      ECOS_API_KEY: process.env.ECOS_API_KEY,
    };
    delete process.env.BOK_ECOS_API_KEY;
    process.env.ECOS_API_KEY = "ecos-test";

    const statuses = getDataSourceStatuses();
    const ecos = statuses.find((entry) => entry.id === "BOK_ECOS");

    expect(ecos?.status.state).toBe("configured");

    if (typeof backups.BOK_ECOS_API_KEY === "string") process.env.BOK_ECOS_API_KEY = backups.BOK_ECOS_API_KEY;
    else delete process.env.BOK_ECOS_API_KEY;
    if (typeof backups.ECOS_API_KEY === "string") process.env.ECOS_API_KEY = backups.ECOS_API_KEY;
    else delete process.env.ECOS_API_KEY;
  });
});
