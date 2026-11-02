import type { Metadata } from "next";
import { uiTextKo } from "@/lib/uiText.ko";

export const PUBLIC_METADATA_ROUTES = [
  "/",
  "/benefits",
  "/dashboard",
  "/feedback",
  "/gov24",
  "/help",
  "/housing/afford",
  "/housing/subscription",
  "/invest/companies",
  "/planning",
  "/planning/reports",
  "/planning/reports/[id]",
  "/planning/runs",
  "/planning/runs/[id]",
  "/planning/trash",
  "/products",
  "/products/catalog",
  "/products/catalog/[id]",
  "/products/compare",
  "/products/credit-loan",
  "/products/mortgage-loan",
  "/products/pension",
  "/products/rent-house-loan",
  "/public/dart",
  "/public/dart/company",
  "/recommend",
  "/recommend/history",
  "/settings",
  "/settings/alerts",
  "/settings/backup",
  "/settings/data-sources",
  "/settings/maintenance",
  "/settings/recovery",
  "/tools/fx",
] as const;

export type PublicMetadataRoute = (typeof PUBLIC_METADATA_ROUTES)[number];

export const PUBLIC_TITLE_TEMPLATE = `%s | ${uiTextKo.app.title}`;

export const ROOT_PUBLIC_METADATA: Metadata = {
  title: {
    default: uiTextKo.app.title,
    template: PUBLIC_TITLE_TEMPLATE,
  },
  description: uiTextKo.app.description,
};

export const PUBLIC_PAGE_METADATA = {
  "/": {
    title: { absolute: "개인 재무진단과 금융상품 비교 | MMD" },
    description: "재무 상태를 진단하고 현재 조건에 맞는 금융상품과 공공혜택 후보를 비교하는 개인용 금융 플래닝 서비스입니다.",
  },
  "/benefits": {
    title: "공공혜택 탐색",
    description: "중앙부처와 지자체 혜택을 검색어와 지역 기준으로 찾아 비교합니다.",
  },
  "/dashboard": {
    title: "재무 대시보드",
    description: "최근 플랜과 데이터 상태, 혜택 흐름을 확인하고 재무진단과 상품 비교로 이어갑니다.",
  },
  "/feedback": {
    title: "의견·도움 요청",
    description: "서비스 이용 중 겪은 문제나 개선 아이디어를 민감정보 없이 운영자에게 전달합니다.",
  },
  "/gov24": {
    title: "보조금24 혜택 찾기",
    description: "입력한 조건에 맞는 정부 혜택 후보와 신청 전에 확인할 사항을 정리합니다.",
  },
  "/help": {
    title: "서비스 이용 도움말",
    description: "재무진단, 상품 비교, 공공혜택 탐색과 데이터 관리 화면의 이용 방법을 확인합니다.",
  },
  "/housing/afford": {
    title: "주거비 감당 가능성 비교",
    description: "소득과 지출, 보증금과 대출 조건을 바탕으로 전월세·매수 시나리오의 부담을 비교합니다.",
  },
  "/housing/subscription": {
    title: "청약 공고 탐색",
    description: "지역과 기간, 주택 유형을 기준으로 청약 공고 후보를 찾고 신청 전 확인 사항을 살펴봅니다.",
  },
  "/invest/companies": {
    title: "기업 투자정보 탐색",
    description: "기업별 공시와 주요 재무 정보를 찾아 투자 판단 전에 확인할 기초 자료를 비교합니다.",
  },
  "/planning": {
    title: "재무진단·플래닝",
    description: "프로필을 바탕으로 재무 상태를 진단하고 실행 결과와 시나리오를 저장·비교합니다.",
  },
  "/planning/reports": {
    title: "플래닝 리포트",
    description: "저장한 재무진단 결과를 다시 읽고 다른 실행과의 변화와 후속 확인 항목을 살펴봅니다.",
  },
  "/planning/reports/[id]": {
    title: "저장 리포트 상세",
    description: "선택한 저장 리포트의 계산 결과와 해석, 비교 근거를 개인정보가 드러나지 않는 제목으로 확인합니다.",
  },
  "/planning/runs": {
    title: "플래닝 실행 기록",
    description: "저장한 재무진단 실행을 다시 열고 서로 비교하거나 상세 리포트로 이어갑니다.",
  },
  "/planning/runs/[id]": {
    title: "저장 실행 상세",
    description: "선택한 재무진단 실행의 결과와 후속 행동 기록을 개인정보가 드러나지 않는 제목으로 확인합니다.",
  },
  "/planning/trash": {
    title: "삭제한 실행 복구",
    description: "삭제 보관함의 재무진단 실행을 확인하고 필요한 기록을 복원하거나 완전히 정리합니다.",
  },
  "/products": {
    title: "금융상품 탐색",
    description: "예금·적금 통합 카탈로그와 연금·대출 상품군별 비교 화면으로 이동하는 시작점입니다.",
  },
  "/products/catalog": {
    title: "예금·적금 통합 비교",
    description: "예금·적금 상품을 검색 조건, 기간, 금리와 제공 기관 기준으로 좁혀 비교합니다.",
  },
  "/products/catalog/[id]": {
    title: "금융상품 상세",
    description: "선택한 예금·적금 상품의 기간별 금리와 우대조건, 제공 기관 정보를 다시 확인합니다.",
  },
  "/products/compare": {
    title: "금융상품 비교함",
    description: "비교함에 담은 예금·적금 후보의 금리, 기간과 주요 조건을 같은 기준으로 나란히 확인합니다.",
  },
  "/products/credit-loan": {
    title: "신용대출 상품 비교",
    description: "신용대출 상품의 금리 구간과 제공 기관, 공시 조건을 기준 시점과 함께 비교합니다.",
  },
  "/products/mortgage-loan": {
    title: "주택담보대출 상품 비교",
    description: "주택담보대출 상품의 금리 방식과 상환 조건, 제공 기관 정보를 비교합니다.",
  },
  "/products/pension": {
    title: "연금저축 상품 비교",
    description: "연금저축 상품의 수익률과 수수료, 공시 조건을 기준 시점과 함께 비교합니다.",
  },
  "/products/rent-house-loan": {
    title: "전세자금대출 상품 비교",
    description: "전세자금대출 상품의 금리 구간과 상환 방식, 제공 기관 정보를 비교합니다.",
  },
  "/public/dart": {
    title: "DART 기업공시 탐색",
    description: "기업명과 공시 조건으로 전자공시 후보를 찾고 최신 수집 상태와 함께 확인합니다.",
  },
  "/public/dart/company": {
    title: "기업공시 상세",
    description: "선택한 기업의 공시 목록과 주요 분류를 확인하고 원문 검토로 이어갑니다.",
  },
  "/recommend": {
    title: {
      default: "예적금 상품 추천 비교",
      template: PUBLIC_TITLE_TEMPLATE,
    },
    description: "입력 조건과 플래닝 정보를 기준으로 예금·적금 후보와 비교 근거를 확인합니다.",
  },
  "/recommend/history": {
    title: "추천 비교 기록",
    description: "저장한 추천 비교 결과와 조건 변화를 다시 확인합니다.",
  },
  "/settings": {
    title: "내 설정과 데이터 관리",
    description: "데이터 신뢰 상태, 알림, 백업, 복구와 유지관리 설정을 확인합니다.",
  },
  "/settings/alerts": {
    title: "공시 알림 설정",
    description: "기업·공시 분류·키워드별 알림 제외 규칙을 확인하고 필요한 기준을 관리합니다.",
  },
  "/settings/backup": {
    title: "재무 데이터 백업·복원",
    description: "현재 사용자의 재무 데이터를 암호화해 내보내고, 백업 파일을 미리 확인한 뒤 복원합니다.",
  },
  "/settings/data-sources": {
    title: "데이터 소스 상태",
    description: "금융상품과 공공데이터의 연결 상태, 최신성, 누락 시 사용자 영향과 대체 경로를 확인합니다.",
  },
  "/settings/maintenance": {
    title: "데이터 유지 관리",
    description: "임시 데이터 보관 기준과 정리 결과를 확인하고 로컬 운영 범위의 유지 관리 작업을 수행합니다.",
  },
  "/settings/recovery": {
    title: "화면 설정 복구",
    description: "이 브라우저의 화면 설정을 초기화하거나 백업 복원과 데이터 소스 상태 화면으로 이동합니다.",
  },
  "/tools/fx": {
    title: "환율 계산 도구",
    description: "입력한 금액을 선택한 통화와 환율 기준으로 환산하고 계산 전제와 기준 시점을 확인합니다.",
  },
} satisfies Record<PublicMetadataRoute, Metadata>;

function normalizeMetadataText(value: string | null | undefined, maxLength: number): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function buildPublicProductDetailMetadata(input: {
  id: string;
  productName?: string | null;
  providerName?: string | null;
}): Metadata {
  const productName = normalizeMetadataText(input.productName, 60);
  const providerName = normalizeMetadataText(input.providerName, 50);
  const identifier = normalizeMetadataText(input.id, 40);
  const title = productName
    ? `${productName} 상품 상세`
    : (identifier ? `상품 ${identifier} 상세` : PUBLIC_PAGE_METADATA["/products/catalog/[id]"].title);
  const subject = productName || identifier || "선택한 금융상품";
  const providerContext = providerName ? `${providerName}에서 제공하는 ` : "";

  return {
    title,
    description: `${providerContext}${subject}의 기간별 금리와 우대조건, 제공 정보를 현재 비교 기준으로 확인합니다.`,
  };
}
