import { buildExternalKey, normalizeName } from "../matching";
import { requestDatagoText } from "./client";
import { type NormalizedExternalProduct } from "../types";
import { parseKdbDepositXml } from "./xml";

const KDB_ENDPOINT = "http://apis.data.go.kr/B190030/GetDepositProductInfoService/getDepositProductList";

export type KdbFetchOptions = {
  fromYmd: string;
  toYmd: string;
  numOfRows?: number;
};

function pickText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function parseRateEvidence(text: string): Record<string, unknown> {
  if (!text.trim()) return { raw: text };
  const pct = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const month = text.match(/(\d+)\s*(?:개월|month|months)/i);
  return {
    raw: text,
    maxRatePct: pct?.[1] ? Number(pct[1]) : null,
    periodMonths: month?.[1] ? Number(month[1]) : null,
  };
}

export { parseKdbDepositXml } from "./xml";

export async function fetchKdbProducts(options: KdbFetchOptions): Promise<{ items: NormalizedExternalProduct[]; pageCount: number }> {
  const numOfRows = options.numOfRows ?? 300;
  const firstXml = await requestDatagoText("datago_kdb", KDB_ENDPOINT, {
    pageNo: 1,
    numOfRows,
    sBseDt: options.fromYmd,
    eBseDt: options.toYmd,
  });
  const first = parseKdbDepositXml(firstXml.text);
  const pages = Math.max(1, Math.ceil(first.totalCount / first.numOfRows));
  const rows = [...first.items];

  for (let page = 2; page <= pages; page += 1) {
    const xml = await requestDatagoText("datago_kdb", KDB_ENDPOINT, {
      pageNo: page,
      numOfRows,
      sBseDt: options.fromYmd,
      eBseDt: options.toYmd,
    });
    rows.push(...parseKdbDepositXml(xml.text).items);
  }

  const normalized: NormalizedExternalProduct[] = [];
  for (const row of rows) {
      const providerNameRaw = pickText(row, ["instNm", "fncIstNm", "bankNm", "korCoNm", "orgNm"]) || "한국산업은행";
      const productNameRaw = pickText(row, ["prdNm", "productNm"]);
      if (!productNameRaw) continue;

      const summary = pickText(row, ["prdOtl", "prdSmr", "desc"]);
      const hitRateText = pickText(row, ["hitIrtCndCone"]);
      const joinPurpose = pickText(row, ["prdJinPpo"]);

      normalized.push({
        sourceId: "datago_kdb" as const,
        kind: "deposit" as const,
        externalKey: buildExternalKey(providerNameRaw, productNameRaw, "deposit"),
        providerNameRaw,
        providerNameNorm: normalizeName(providerNameRaw),
        productNameRaw,
        productNameNorm: normalizeName(productNameRaw),
        summary,
        rawJson: {
          ...row,
          rateEvidence: parseRateEvidence(hitRateText),
          joinPurpose,
        },
      });
  }

  return { items: normalized, pageCount: pages };
}
