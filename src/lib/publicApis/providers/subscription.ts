import { type PublicApiResult, type SubscriptionNotice } from "@/lib/publicApis/contracts/types";

export async function listSubscriptionNotices(region: string): Promise<PublicApiResult<SubscriptionNotice[]>> {
  const now = new Date().toISOString();
  return {
    ok: true,
    data: [
      {
        id: "subscription-mock-1",
        title: `${region || "전국"} 분양 공고 확인(샘플)` ,
        region: region || "전국",
        applyStart: now.slice(0, 10),
        applyEnd: now.slice(0, 10),
        supplyType: "민영",
        sizeHints: "59~84m2",
        link: undefined,
        source: "한국부동산원 청약홈(mock)",
        fetchedAt: now,
      },
    ],
  };
}
