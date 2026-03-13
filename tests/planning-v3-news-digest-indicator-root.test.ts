import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as digestGET } from "../src/app/api/planning/v3/news/digest/route";
import { INDICATOR_SERIES_SPECS } from "../planning/v3/indicators/specs";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestGet(pathname: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/news`,
    },
  });
}

describe("planning v3 news digest indicator root integration", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-news-digest-indicator-root-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, "planning");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads disabled indicator overrides from env-aware root when sanitizing digest watchlist", async () => {
    const newsRoot = path.join(root, "news");
    const indicatorsRoot = path.join(root, "indicators");
    fs.mkdirSync(newsRoot, { recursive: true });
    fs.mkdirSync(indicatorsRoot, { recursive: true });

    fs.writeFileSync(path.join(newsRoot, "digest_day.latest.json"), `${JSON.stringify({
      date: "2026-03-04",
      generatedAt: "2026-03-04T00:00:00.000Z",
      topItems: [],
      topTopics: [],
      burstTopics: [],
      watchlist: [{
        label: "기준금리",
        seriesId: "kr_base_rate",
        view: "last",
        window: 1,
        status: "unknown",
        valueSummary: "데이터 부족",
        asOf: null,
      }],
      scenarioCards: [],
      summary: {
        observation: "관찰",
        evidenceLinks: [],
        watchVariables: [],
        counterSignals: [],
      },
    }, null, 2)}\n`, "utf-8");

    const baseSpec = INDICATOR_SERIES_SPECS.find((row) => row.id === "kr_base_rate");
    if (!baseSpec) throw new Error("missing base indicator spec");
    fs.writeFileSync(path.join(indicatorsRoot, "specOverrides.json"), `${JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-03-04T00:00:00.000Z",
      specs: [{
        ...baseSpec,
        enabled: false,
      }],
    }, null, 2)}\n`, "utf-8");

    const response = await digestGET(requestGet("/api/planning/v3/news/digest"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        watchlist?: Array<{ unknownReasonCode?: string; resolveHref?: string | null }>;
      } | null;
    };
    expect(payload.ok).toBe(true);
    expect(payload.data?.watchlist?.[0]?.unknownReasonCode).toBe("disabled");
    expect(payload.data?.watchlist?.[0]?.resolveHref).toBe("/planning/v3/news/settings#indicator-series-specs");
  });
});
