# 2026-03-16 P2-3 action CTA first path

## 변경 파일
- `src/lib/planner/compute.ts`
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-3-action-cta-first-path.md`

## 사용 skill
- `planning-gate-selector`: report dashboard link 변경에 맞는 최소 검증을 `pnpm build`로 고르는 데 사용.
- `route-ssot-check`: 새 CTA가 실존 public route인 `/recommend`를 계속 가리키는지 확인하는 데 사용.
- `work-log-closeout`: 이번 첫 action-based CTA 배치의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P2-2`까지는 planning handoff가 `/recommend`로 전달되더라도, planning report의 top action 카드에서 추천 화면으로 바로 이어지는 action-based CTA는 아직 없었습니다.
- 이번 라운드는 `P2-3`의 첫 경로만 열기 위해, `BUILD_EMERGENCY_FUND` 액션 한 건만 기존 emergency recommend preset으로 연결하는 것이 목적이었습니다.

## 핵심 변경
- `src/lib/planner/compute.ts`의 emergency recommend preset 상수를 export해 report dashboard에서도 같은 preset 값을 재사용할 수 있게 맞췄습니다.
- `ReportDashboard` top action 카드에서 `action.code === "BUILD_EMERGENCY_FUND"`일 때만 CTA를 노출합니다.
- CTA는 기존 emergency recommend preset query에 `planning.runId`, `planning.summary.stage`, optional `planning.summary.overallStatus`를 추가해 `/recommend`로 이동합니다.
- `from=planning-report`는 유지해 기존 report → recommend handoff 맥락을 그대로 이어가게 했습니다.
- 이번 라운드에서는 다른 action code, preset mapping 표, explanation 확장은 열지 않았습니다.

## 검증
- `pnpm build`
  - 통과.
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/lib/planner/compute.ts src/app/planning/reports/_components/ReportDashboard.tsx work/3/16/2026-03-16-p2-3-action-cta-first-path.md`

## 남은 리스크
- 이번 라운드는 `BUILD_EMERGENCY_FUND` 한 건만 열었으므로, `REDUCE_DEBT_SERVICE`, `COVER_LUMP_SUM_GOAL`, `IMPROVE_RETIREMENT_PLAN` 매핑은 아직 없습니다.
- planning stage는 report VM raw run payload에서 읽어 오므로, 향후 canonical handoff projection이 저장되면 source를 더 명시적으로 바꾸는 편이 안전합니다.
- CTA는 preset 재사용만 한 상태라, `P2-4`에서 결과 explanation과 더 자연스럽게 이어 주는 문구는 아직 없습니다.

## 다음 우선순위
- `P2-3` 후속: 다음 action code를 열기 전에 emergency CTA의 결과 설명 연결 범위를 먼저 좁혀 결정
- `P2-4`: recommend 결과 explanation을 planning action 맥락까지 넓힐지 설계
