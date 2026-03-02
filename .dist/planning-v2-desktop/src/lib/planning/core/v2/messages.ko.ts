export const ko = {
  INPUT: "입력값이 올바르지 않습니다.",
  SNAPSHOT_NOT_FOUND: "지정한 스냅샷을 찾을 수 없습니다.",
  SNAPSHOT_MISSING: "최신 지표 스냅샷이 없어 기본 가정으로 계산했습니다.",
  BUDGET_EXCEEDED: "요청한 계산량이 너무 큽니다. 기간 또는 paths를 줄여주세요.",
  DISABLED: "서버 설정으로 비활성화된 기능입니다.",
  LOCAL_ONLY: "로컬 환경에서만 사용할 수 있습니다.",
  CSRF: "요청이 차단되었습니다(CSRF). 페이지를 새로고침 후 다시 시도하세요.",
  INTERNAL: "처리 중 오류가 발생했습니다.",
} as const;

export type PlanningKoMessageCode = keyof typeof ko;
