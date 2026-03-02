import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { getExchangeQuotes } from "@/lib/publicApis/providers/fx";

const TTL_SECONDS = 12 * 60 * 60;

function parsePairs(input: string): Array<{ currency: string; amount: number }> {
  return input
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [currencyRaw, amountRaw] = chunk.split(":");
      const currency = (currencyRaw ?? "").toUpperCase();
      const amount = Number(amountRaw ?? "0");
      return { currency, amount: Number.isFinite(amount) ? amount : 0 };
    })
    .filter((row) => /^[A-Z]{3}$/.test(row.currency));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = (searchParams.get("date") ?? "").trim();
  const pairsInput = (searchParams.get("pairs") ?? "USD:1000").trim();

  const pairs = parsePairs(pairsInput);
  if (!pairs.length) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "pairs 형식이 올바르지 않습니다. 예: USD:1000,JPY:50000" } }, { status: 400 });
  }

  const key = makeApiCacheKey("fx", { date, pairs });
  const hit = getApiCacheRecord(key);
  if (hit) {
    const payload = hit.entry.payload as Record<string, unknown>;
    return NextResponse.json({
      ...payload,
      meta: {
        ...(typeof payload.meta === "object" && payload.meta !== null ? payload.meta : {}),
        cache: "hit",
        key,
        fetchedAt: hit.entry.fetchedAt,
        expiresAt: hit.entry.expiresAt,
      },
    });
  }

  const currencies = [...new Set(pairs.map((p) => p.currency))];
  const result = await getExchangeQuotes(date, currencies);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error.code === "CONFIG" ? 503 : 502 });
  }

  const quoteMap = new Map(result.data.map((q) => [q.currency, q]));
  const items = pairs.map((pair) => {
    const quote = quoteMap.get(pair.currency);
    const krw = quote ? pair.amount * quote.rate : null;
    return {
      currency: pair.currency,
      amount: pair.amount,
      rate: quote?.rate ?? null,
      asOfDate: quote?.asOfDate ?? null,
      krw,
    };
  });

  const totalKrw = items.reduce((sum, row) => sum + (typeof row.krw === "number" ? row.krw : 0), 0);
  const payload = { ok: true, data: { items, totalKrw, assumptions: { note: "환율은 기준일 데이터 기반이며 변동될 수 있습니다." } } };

  const entry = setApiCache(key, payload, TTL_SECONDS);
  return NextResponse.json({
    ...payload,
    meta: {
      cache: "miss",
      key,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
    },
  });
}
