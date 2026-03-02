import fs from "node:fs";
import path from "node:path";
import { type Provider } from "../types";
import { type SamplebankFixture, type SamplebankProviderData, type SamplebankProviderRequest } from "./types";

function fixturePath(): string {
  return path.join(process.cwd(), "tests", "fixtures", "providers", "samplebank.deposit.json");
}

function readFixture(): SamplebankFixture {
  const raw = fs.readFileSync(fixturePath(), "utf8");
  return JSON.parse(raw) as SamplebankFixture;
}

export const samplebankProvider: Provider<SamplebankProviderRequest, SamplebankProviderData, SamplebankFixture> = {
  id: "samplebank",
  displayName: "샘플은행",
  isConfigured() {
    return true;
  },
  buildCacheKey(req) {
    const kind = req.kind ?? "deposit";
    return `kind=${kind}`;
  },
  async fetch() {
    return readFixture();
  },
  normalize(raw, ctx) {
    const normalizedItems = (raw.items ?? [])
      .filter((item) => item && item.productCode && item.bankName && item.productName)
      .map((item) => ({
        stableId: `samplebank:${item.productCode}`,
        sourceId: "samplebank" as const,
        kind: item.kind,
        externalKey: item.productCode,
        providerName: item.bankName,
        productName: item.productName,
        options: (item.options ?? []).map((option) => ({
          sourceId: "samplebank" as const,
          termMonths: Number.isFinite(option.termMonths) ? Math.trunc(option.termMonths) : null,
          saveTrm: Number.isFinite(option.termMonths) ? String(Math.trunc(option.termMonths)) : undefined,
          intrRate: Number.isFinite(option.baseRate) ? option.baseRate : null,
          intrRate2: Number.isFinite(option.maxRate) ? option.maxRate : null,
        })),
      }));

    return {
      ok: true,
      data: {
        items: normalizedItems,
      },
      meta: {
        sourceId: "samplebank",
        generatedAt: raw.generatedAt,
        cacheKey: ctx.cacheKey,
        fromReplay: true,
        fallback: {
          mode: "REPLAY",
          sourceKey: "samplebank",
          reason: "fixture_replay",
          generatedAt: raw.generatedAt,
        },
      },
    };
  },
  replayEnabled() {
    return fs.existsSync(fixturePath());
  },
  lastSnapshotGeneratedAt() {
    try {
      return readFixture().generatedAt;
    } catch {
      return null;
    }
  },
};
