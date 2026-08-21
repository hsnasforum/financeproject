import type { Metadata } from "next";
import { uiTextKo } from "@/lib/uiText.ko";

export const PUBLIC_METADATA_ROUTES = [
  "/",
  "/dashboard",
  "/planning",
  "/recommend",
  "/recommend/history",
  "/products",
  "/settings",
  "/benefits",
  "/gov24",
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
  "/dashboard": {
    title: "재무 대시보드",
    description: "최근 플랜과 데이터 상태, 혜택 흐름을 확인하고 재무진단과 상품 비교로 이어갑니다.",
  },
  "/planning": {
    title: "재무진단·플래닝",
    description: "프로필을 바탕으로 재무 상태를 진단하고 실행 결과와 시나리오를 저장·비교합니다.",
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
  "/products": {
    title: "금융상품 탐색",
    description: "예금·적금 통합 카탈로그와 연금·대출 상품군별 비교 화면으로 이동하는 시작점입니다.",
  },
  "/settings": {
    title: "내 설정과 데이터 관리",
    description: "데이터 신뢰 상태, 알림, 백업, 복구와 유지관리 설정을 확인합니다.",
  },
  "/benefits": {
    title: "공공혜택 탐색",
    description: "중앙부처와 지자체 혜택을 검색어와 지역 기준으로 찾아 비교합니다.",
  },
  "/gov24": {
    title: "보조금24 혜택 찾기",
    description: "입력한 조건에 맞는 정부 혜택 후보와 신청 전에 확인할 사항을 정리합니다.",
  },
} satisfies Record<PublicMetadataRoute, Metadata>;
