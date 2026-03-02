import type { AllowedFixId } from "../dev/fixCatalog";

export type ChainId = "DB_REPAIR" | "DART_SETUP" | "FULL_REPAIR";

export type FixChainRisk = "LOW" | "MEDIUM" | "HIGH";

export type FixChainDef = {
  risk: FixChainRisk;
  title: string;
  steps: AllowedFixId[];
  impact: string[];
};

export const FIX_CHAIN_DEFS: Record<ChainId, FixChainDef> = {
  DB_REPAIR: {
    risk: "MEDIUM",
    title: "DB 복구",
    steps: ["PRISMA_PUSH", "SEED_DEBUG"],
    impact: [
      "Prisma schema를 현재 모델로 동기화합니다.",
      "디버그 시드 데이터를 재적재합니다.",
    ],
  },
  DART_SETUP: {
    risk: "MEDIUM",
    title: "DART 설정",
    steps: ["DATA_DOCTOR", "DART_WATCH"],
    impact: [
      "스키마/신선도 진단 리포트를 갱신합니다.",
      "DART 감시 스크립트를 실행해 설정 상태를 점검합니다.",
    ],
  },
  FULL_REPAIR: {
    risk: "HIGH",
    title: "전체 복구",
    steps: ["PRISMA_PUSH", "SEED_DEBUG", "DATA_DOCTOR", "DART_WATCH"],
    impact: [
      "DB 복구와 DART 설정 체인을 순차 실행합니다.",
      "시드/진단 결과가 한 번에 갱신되어 기존 디버그 상태가 바뀔 수 있습니다.",
    ],
  },
};

export const FIX_CHAINS: Record<ChainId, AllowedFixId[]> = {
  DB_REPAIR: FIX_CHAIN_DEFS.DB_REPAIR.steps,
  DART_SETUP: FIX_CHAIN_DEFS.DART_SETUP.steps,
  FULL_REPAIR: FIX_CHAIN_DEFS.FULL_REPAIR.steps,
};

export function isChainId(value: string): value is ChainId {
  return Object.prototype.hasOwnProperty.call(FIX_CHAIN_DEFS, value);
}
