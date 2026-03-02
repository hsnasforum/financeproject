import fs from "node:fs";
import path from "node:path";
import { fetchEximExchange, getKstTodayYYYYMMDD } from "../../publicApis/providers/exchange";
import { type Provider } from "../types";
import { type ExchangeProviderData, type ExchangeProviderRequest } from "./types";

function readExchangeSnapshotGeneratedAt(): string | null {
  const filePath = path.join(process.cwd(), ".data", "exchange_snapshot.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { generatedAt?: unknown };
    return typeof parsed.generatedAt === "string" ? parsed.generatedAt : null;
  } catch {
    return null;
  }
}

export const exchangeProvider: Provider<ExchangeProviderRequest, ExchangeProviderData> = {
  id: "exchange",
  displayName: "한국수출입은행 환율",
  cooldownKey: "exchange",
  isConfigured(env) {
    return Boolean((env.EXIM_EXCHANGE_API_KEY ?? "").trim() && (env.EXIM_EXCHANGE_API_URL ?? "").trim());
  },
  buildCacheKey(req) {
    const date = (req.dateYYYYMMDD ?? "").trim() || getKstTodayYYYYMMDD();
    return `date=${date}`;
  },
  async fetch(req) {
    const date = (req.dateYYYYMMDD ?? "").trim() || getKstTodayYYYYMMDD();
    const result = await fetchEximExchange({ dateYYYYMMDD: date });
    const generatedAt = new Date().toISOString();

    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: result.error.code,
          message: result.error.message,
          ...(result.error.diagnostics ? { debug: result.error.diagnostics } : {}),
        },
        meta: {
          sourceId: "exchange",
          generatedAt,
        },
      };
    }

    return {
      ok: true,
      data: result.data,
      meta: {
        sourceId: "exchange",
        generatedAt,
      },
    };
  },
  replayEnabled() {
    return Boolean(readExchangeSnapshotGeneratedAt());
  },
  lastSnapshotGeneratedAt() {
    return readExchangeSnapshotGeneratedAt();
  },
};
