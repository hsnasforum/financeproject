import { type BenefitCandidate, type PublicApiResult } from "@/lib/publicApis/contracts/types";

export async function searchBenefits(query: string): Promise<PublicApiResult<BenefitCandidate[]>> {
  const now = new Date().toISOString();
  // 스펙 확정 전 스켈레톤: 샘플 호출 확정 전까지 안전한 목업+안내 반환
  const items: BenefitCandidate[] = query
    ? [
        {
          id: "benefit-mock-1",
          title: "주거 지원 프로그램 후보",
          summary: "주거/청년/가구 조건에 따라 지원 여부가 달라질 수 있습니다.",
          eligibilityHints: ["연령/가구/소득 조건 확인", "거주지역 공고 확인"],
          applyHow: "보조금24 또는 지자체 안내 페이지에서 신청",
          org: "행정안전부(보조금24)",
          source: "행정안전부(mock)",
          fetchedAt: now,
        },
      ]
    : [];

  return { ok: true, data: items };
}
