import { odcloudFetchWithAuth, resolveOdcloudEndpoint, setSearchParams } from "../odcloud";
import { buildSearchText, extractOdcloudRows, scanPagedOdcloud } from "../odcloudScan";
import { type PublicApiResult, type SubscriptionNotice, type PublicApiErrorCode } from "../contracts/types";

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[\s_\-:/()[\].]/g, "");
}

function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  const keyMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    keyMap.set(normalizeLookupKey(k), v);
  }
  for (const key of keys) {
    const hit = keyMap.get(normalizeLookupKey(key));
    if (hit === undefined || hit === null) continue;
    const value = String(hit).trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeRegionToken(value: string): string {
  return value.replace(/\s+/g, "").replace(/특별시|광역시|특별자치시|특별자치도|도|시|군|구/g, "").trim();
}

function isNationwideRegion(value: string): boolean {
  const token = normalizeRegionToken(value);
  return token === "" || token === "전국" || token === "전체";
}

function regionFromCode(raw: unknown): string | undefined {
  const value = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!value) return undefined;
  const homeMap: Record<string, string> = {
    "100": "서울",
    "200": "강원",
    "300": "대전",
    "312": "충남",
    "338": "세종",
    "360": "충북",
    "400": "인천",
    "410": "경기",
    "500": "광주",
    "513": "전남",
    "560": "전북",
    "600": "부산",
    "621": "경남",
    "680": "울산",
    "690": "제주",
    "700": "대구",
    "712": "경북",
  };
  if (homeMap[value]) return homeMap[value];
  if (homeMap[value.slice(0, 3)]) return homeMap[value.slice(0, 3)];

  const legacyPrefix = value.slice(0, 2);
  const legacyMap: Record<string, string> = {
    "11": "서울",
    "26": "부산",
    "27": "대구",
    "28": "인천",
    "29": "광주",
    "30": "대전",
    "31": "울산",
    "36": "세종",
    "41": "경기",
    "42": "강원",
    "43": "충북",
    "44": "충남",
    "45": "전북",
    "46": "전남",
    "47": "경북",
    "48": "경남",
    "50": "제주",
  };
  return legacyMap[legacyPrefix];
}

function regionCodeFromName(raw: string): string | undefined {
  const token = normalizeRegionToken(raw);
  const map: Record<string, string> = {
    서울: "100",
    강원: "200",
    대전: "300",
    충남: "312",
    세종: "338",
    충북: "360",
    인천: "400",
    경기: "410",
    광주: "500",
    전남: "513",
    전북: "560",
    부산: "600",
    경남: "621",
    울산: "680",
    제주: "690",
    대구: "700",
    경북: "712",
  };
  return map[token];
}

function normalizeDate(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return undefined;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function endpointByHouseType(houseType?: string): string {
  const type = (houseType ?? "apt").toLowerCase();
  if (type === "urbty") return "/ApplyhomeInfoDetailSvc/v1/getUrbyOfctLttotPblancDetail";
  if (type === "remndr") return "/ApplyhomeInfoDetailSvc/v1/getRemndrLttotPblancDetail";
  return "/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail";
}

function endpointCandidatesByHouseType(houseType?: string): string[] {
  const type = (houseType ?? "apt").toLowerCase();
  if (type === "urbty") {
    return [
      "/ApplyhomeInfoDetailSvc/v1/getUrbyOfctLttotPblancDetail",
      "/ApplyhomeInfoDetailSvc/v1/getUrbtyOfctlLttotPblancDetail",
      "/ApplyhomeInfoDetailSvc/v1/getUrbtyOfctLttotPblancDetail",
    ];
  }
  if (type === "remndr") {
    return [
      "/ApplyhomeInfoDetailSvc/v1/getRemndrLttotPblancDetail",
      "/ApplyhomeInfoDetailSvc/v1/getAPTRemndrLttotPblancDetail",
    ];
  }
  return ["/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail"];
}

function collectRegionText(row: Record<string, unknown>): string {
  const fields = [
    firstString(row, ["subscrptAreaCodeNm", "sido", "sigungu", "region"]),
    regionFromCode(row.subscrptAreaCode ?? row.areaCode ?? row.regionCode),
    buildSearchText(row),
  ]
    .filter((v): v is string => Boolean(v))
    .join(" ");
  return fields.toLowerCase();
}

type NormalizeDropStats = {
  missingTitle: number;
  generatedId: number;
};

function normalizeSubscription(rows: Record<string, unknown>[], requestedRegion: string): { items: SubscriptionNotice[]; dropStats: NormalizeDropStats } {
  const now = new Date().toISOString();
  const requestedRegionNormalized = requestedRegion.trim() ? requestedRegion.trim() : undefined;
  const items: SubscriptionNotice[] = [];
  const dropStats: NormalizeDropStats = { missingTitle: 0, generatedId: 0 };

  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const rec = row as Record<string, unknown>;
    const title = firstString(rec, [
      "houseNm",
      "HOUSE_NM",
      "bizNm",
      "aptName",
      "noticeTitle",
      "PBLANC_NM",
      "공고명",
      "주택명",
      "title",
    ]);
    if (!title) {
      dropStats.missingTitle += 1;
      return;
    }

    const rawId = firstString(rec, [
      "houseManageNo",
      "HOUSE_MANAGE_NO",
      "noticeId",
      "PBLANC_NO",
      "id",
      "공고번호",
    ]);
    if (!rawId) dropStats.generatedId += 1;

    items.push({
      id: rawId ?? `subscription-${index}-${title.slice(0, 12)}`,
      title,
      region:
        firstString(rec, ["region", "subscrptAreaCodeNm", "SUBSCRPT_AREA_CODE_NM", "sido", "sigungu"]) ??
        regionFromCode(rec.subscrptAreaCode ?? rec.SUBSCRPT_AREA_CODE ?? rec.areaCode ?? rec.regionCode) ??
        requestedRegionNormalized ??
        "전국",
      applyStart: firstString(rec, ["applyStart", "rceptBgnde", "RCEPT_BGNDE", "startDate"]) ?? undefined,
      applyEnd: firstString(rec, ["applyEnd", "rceptEndde", "RCEPT_ENDDE", "endDate"]) ?? undefined,
      supplyType: firstString(rec, ["supplyType", "houseSecdNm", "HOUSE_SECD_NM"]) ?? undefined,
      sizeHints: firstString(rec, ["sizeHints", "suplyAr", "SUPLY_AR", "houseTy", "HOUSE_TY"]) ?? undefined,
      address: firstString(rec, ["hssplyAdres", "HSSPLY_ADRES", "address", "공급위치"]) ?? undefined,
      totalHouseholds: firstString(rec, ["totSuplyHshldco", "TOT_SUPLY_HSHLDCO", "totalHouseholds", "세대수"]) ?? undefined,
      contact: firstString(rec, ["bsnsMbyNm", "BSNS_MBY_NM", "contact", "문의처"]) ?? undefined,
      details: Object.fromEntries(
        [
          ["공고번호", firstString(rec, ["pblancNo", "PBLANC_NO"])],
          ["주택구분", firstString(rec, ["houseSecdNm", "HOUSE_SECD_NM"])],
          ["공급위치", firstString(rec, ["hssplyAdres", "HSSPLY_ADRES"])],
          ["모집세대수", firstString(rec, ["totSuplyHshldco", "TOT_SUPLY_HSHLDCO"])],
          ["문의처", firstString(rec, ["bsnsMbyNm", "BSNS_MBY_NM"])],
          ["시공사", firstString(rec, ["cnstrctEntrpsNm", "CNSTRCT_ENTRPS_NM"])],
          ["사업주체", firstString(rec, ["bsnsMbyNm", "BSNS_MBY_NM"])],
        ].filter((entry): entry is [string, string] => Boolean(entry[1])),
      ),
      link: firstString(rec, ["link", "pblancUrl", "PBLANC_URL", "detailUrl"]) ?? undefined,
      source: "한국부동산원 청약홈",
      fetchedAt: now,
    } as SubscriptionNotice);
  });

  return { items, dropStats };
}

export async function listSubscriptionNotices(
  region: string,
  options?: {
    deep?: boolean;
    mode?: "search" | "all";
    scanPages?: number;
    houseType?: "apt" | "urbty" | "remndr";
    from?: string;
    to?: string;
    q?: string;
  },
): Promise<PublicApiResult<SubscriptionNotice[]>> {
  const apiKey = (process.env.REB_SUBSCRIPTION_API_KEY ?? "").trim();
  if (!apiKey) {
    return { ok: false, error: { code: "ENV_MISSING", message: "청약홈 API 설정이 필요합니다." } };
  }

  const endpointCandidates = endpointCandidatesByHouseType(options?.houseType);

  try {
    const requestedRegion = region.trim();
    const requestedRegionToken = isNationwideRegion(requestedRegion) ? "" : normalizeRegionToken(requestedRegion);
    const requestedRegionCode = requestedRegionToken ? regionCodeFromName(requestedRegion) : undefined;
    const dateFrom = normalizeDate(options?.from ?? "") ?? daysAgoIso(90);
    const dateTo = normalizeDate(options?.to ?? "") ?? todayIso();
    const q = (options?.q ?? "").trim();

    const baseConds: Record<string, string> = {
      "cond[RCRIT_PBLANC_DE::GTE]": dateFrom,
      "cond[RCRIT_PBLANC_DE::LTE]": dateTo,
      ...(q ? { "cond[HOUSE_NM::LIKE]": q } : {}),
    };

    const strategies: Array<{ name: string; conds: Record<string, string> }> = [];
    if ((options?.mode ?? "search") === "search" && requestedRegionToken) {
      strategies.push({
        name: "upstream_cond_area_name",
        conds: { ...baseConds, "cond[SUBSCRPT_AREA_CODE_NM::EQ]": requestedRegionToken || requestedRegion },
      });
      if (requestedRegionCode) {
        strategies.push({
          name: "upstream_cond_area_code",
          conds: { ...baseConds, "cond[SUBSCRPT_AREA_CODE::EQ]": requestedRegionCode },
        });
      }
    }
    strategies.push({ name: "local_filter_fallback", conds: baseConds });

    let authMode: "query" | "header-fallback" = "query";
    let usedStrategy = "local_filter_fallback";
    let usedConds: Record<string, string> = {};
    let usedEndpoint = endpointByHouseType(options?.houseType);
    let scan: Awaited<ReturnType<typeof scanPagedOdcloud>> | null = null;
    let resolvedFrom: "full" | "base" | "dir" = "full";
    let lastError: { code: PublicApiErrorCode; message: string } | null = null;

    for (const endpointPath of endpointCandidates) {
      const resolved = resolveOdcloudEndpoint(
        process.env.REB_SUBSCRIPTION_API_URL ?? "",
        endpointPath,
        { allowBaseOnly: true, allowDirOnly: true },
      );
      if (!resolved.ok) {
        if (resolved.error.code === "ENV_DOC_URL") {
          return {
            ok: false,
            error: {
              code: "ENV_DOC_URL",
              message:
                "api-docs는 문서 URL입니다. 호출 URL은 https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail 를 사용하세요.",
            },
          };
        }
        return { ok: false, error: resolved.error };
      }
      usedEndpoint = resolved.endpointPath;
      resolvedFrom = resolved.resolvedFrom;

      for (const strategy of strategies) {
        usedStrategy = strategy.name;
        usedConds = strategy.conds;
        scan = (await scanPagedOdcloud({
          deep: options?.deep,
          mode: "all",
          queryText: "",
          maxPages: options?.scanPages,
          maxMatches: 2000,
          fetchPage: async (pageNo) => {
            const url = new URL(resolved.url.toString());
            setSearchParams(url, { page: pageNo, perPage: 200, returnType: "JSON", ...strategy.conds });
            const fetched = await odcloudFetchWithAuth(url, apiKey, undefined, { allowServiceKeyFallback: true });
            authMode = fetched.authMode;
            if (fetched.response.status === 401 || fetched.response.status === 403) {
              return { ok: false as const, error: { code: "AUTH_FAILED" as PublicApiErrorCode, message: "청약홈 인증에 실패했습니다." } };
            }
            if (!fetched.response.ok) {
              return { ok: false as const, error: { code: "UPSTREAM_ERROR" as PublicApiErrorCode, message: `청약홈 API 응답 오류(${fetched.response.status})` } };
            }
            const text = await fetched.response.text();
            const contentType = fetched.response.headers.get("content-type") ?? "";
            if (contentType.toLowerCase().includes("html") || text.trim().toLowerCase().startsWith("<html")) {
              return { ok: false as const, error: { code: "SCHEMA_MISMATCH" as PublicApiErrorCode, message: "청약홈 API URL/응답 형식을 확인하세요." } };
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(text);
            } catch {
              return { ok: false as const, error: { code: "SCHEMA_MISMATCH" as PublicApiErrorCode, message: "청약홈 응답 형식이 예상과 다릅니다." } };
            }
            const extracted = extractOdcloudRows(parsed);
            if ("error" in extracted) return { ok: false as const, error: extracted.error as { code: PublicApiErrorCode; message: string } };
            return { ok: true as const, rows: extracted.rows, totalCount: extracted.meta.totalCount };
          },
        }));
        if (!scan?.ok) {
          lastError = scan?.error as { code: PublicApiErrorCode; message: string };
          break;
        }
        if (scan.rowsMatched.length > 0 || strategy.name === "local_filter_fallback") break;
      }
      if (scan?.ok) break;
      if (lastError?.code === "AUTH_FAILED" && endpointCandidates.length > 1) {
        continue;
      }
      break;
    }
    if (!scan || !scan.ok) {
      if (lastError) return { ok: false, error: lastError };
      return { ok: false, error: { code: "UPSTREAM_ERROR", message: "청약홈 조회에 실패했습니다." } };
    }

    const allRows = scan.rowsMatched;
    const wantedRegion = requestedRegionToken.toLowerCase();
    const filteredRows =
      (options?.mode ?? "search") === "all" || !wantedRegion
        ? allRows
        : allRows.filter((row: Record<string, unknown>) => {
            const regionText = collectRegionText(row).replace(/특별시|광역시|특별자치시|특별자치도|도|시|군|구/g, "");
            return regionText.includes(wantedRegion) || wantedRegion.includes(regionText);
          });

    const regionCounts = new Map<string, number>();
    for (const row of allRows) {
      const raw = firstString(row, ["subscrptAreaCodeNm", "sido", "region"]) ?? regionFromCode(row.subscrptAreaCode ?? row.areaCode ?? row.regionCode);
      const token = normalizeRegionToken(raw ?? "");
      if (!token) continue;
      regionCounts.set(token, (regionCounts.get(token) ?? 0) + 1);
    }
    const availableRegionsTop = [...regionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);

    const normalized = normalizeSubscription(filteredRows, region);
    return {
      ok: true,
      data: normalized.items,
      meta: {
        resolvedFrom,
        endpointPath: usedEndpoint,
        usedEndpoint,
        usedConds,
        searchStrategy: usedStrategy,
        authMode,
        scannedPages: scan.meta.scannedPages,
        scannedRows: scan.meta.scannedRows,
        upstreamTotalCount: scan.meta.upstreamTotalCount,
        rawMatched: filteredRows.length,
        normalizedCount: normalized.items.length,
        dropStats: normalized.dropStats,
        matchedRows: filteredRows.length,
        truncated: scan.meta.truncated,
        availableRegionsTop,
      },
    };
  } catch {
    return { ok: false, error: { code: "FETCH_FAILED", message: "청약홈 API 호출에 실패했습니다." } };
  }
}

export const __test__ = {
  normalizeRegionToken,
  regionFromCode,
  regionCodeFromName,
  normalizeDate,
  normalizeSubscription,
  endpointByHouseType,
  endpointCandidatesByHouseType,
};
