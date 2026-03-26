# 2026-03-26 v3 import-to-planning beta runs-no-selection-fallback helper-e2e alignment implementation

## 변경 전 메모
1. 수정 대상 파일
- `src/components/PlanningRunsClient.tsx`
- 필요하면 관련 테스트 파일
2. 변경 이유
- `/planning/runs` landing, selected state, compare state helper는 정리됐지만, no-selection fallback은 아직 representative user flow로 직접 검증되지 않았다.
3. 실행할 검증 명령
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- 필요하면 관련 테스트 추가 또는 확장

## 변경 파일
- `src/components/PlanningRunsClient.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-runs-no-selection-fallback-helper-e2e-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: no-selection / no-runs helper wording round에 맞는 최소 검증 세트를 `lint`, `build`, `e2e:rc`, `git diff --check`로 고정하고 미실행 조건부 가드를 분리하기 위해 사용.
- `route-ssot-check`: `/planning/runs`, `/planning/runs/[id]`, `/planning/reports`의 stable/public route 계약과 href/query semantics를 유지한 채 helper wording과 e2e만 다루는지 확인하기 위해 사용.
- `work-log-closeout`: 변경 전 메모를 먼저 남기고, 구현 후 실제 변경/검증/남은 리스크를 같은 `/work` 파일에 closeout 형식으로 정리하기 위해 사용.

## 변경 이유
- `/planning/runs` landing, selected state, compare state helper는 정리됐지만, no-selection fallback은 아직 representative user flow로 직접 검증되지 않았다.
- 이번 라운드는 route, run/report contract, compare 계산, delete/restore, report href는 그대로 두고 `저장된 실행이 없거나 아직 선택되지 않은 상태`에서 다음 행동이 어디인지 더 바로 읽히게 만드는 smallest safe batch가 목적이었다.

## 핵심 변경
- `src/components/PlanningRunsClient.tsx`의 no-runs empty-state 문구를 `먼저 /planning에서 실행 저장 -> /planning/runs에서 다시 확인/비교 -> 필요한 실행만 리포트 이동` 흐름으로 더 직접적으로 정리했다.
- 같은 파일의 no-selection fallback 문구를 `실행이 준비되면 목록에서 하나를 선택해 저장 결과를 다시 읽고, 필요하면 바로 상세 리포트로 이어간다`는 문맥으로 더 직접적으로 바꿨다.
- no-runs empty state와 no-selection fallback이 서로 다른 상태라는 점을 흐리지 않도록, no-runs는 `저장 전` 단계, no-selection은 `선택 전` 단계를 안내하는 문장으로 분리했다.
- `tests/e2e/flow-history-to-report.spec.ts`에 빈 profile scope로 `/planning/runs?profileId=...`에 들어가는 narrow e2e를 추가해 no-runs 문구와 no-selection fallback 문구가 함께 노출되는 대표 흐름을 직접 확인했다.
- 새 e2e는 seed profile을 마지막에 정리해 뒤에 오는 quickstart preview나 다른 planning e2e를 오염시키지 않도록 유지했다.

## 검증
- `pnpm lint`
  - 결과: PASS
  - 비고: 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- `pnpm build`
  - 결과: PASS
- `pnpm e2e:rc`
  - 결과: PASS
  - 비고: 총 16개 테스트 통과. 새 no-selection/no-runs fallback e2e 포함.
- `git diff --check -- src/components/PlanningRunsClient.tsx src/app/planning/runs/page.tsx src/app/planning/runs/[id]/page.tsx tests/e2e/flow-planner-to-history.spec.ts tests/e2e/flow-history-to-report.spec.ts tests/e2e/planning-v2-fast.spec.ts work/3/26/2026-03-26-v3-import-to-planning-beta-runs-no-selection-fallback-helper-e2e-alignment-implementation.md`
  - 결과: PASS
- [미실행] `pnpm planning:current-screens:guard` — route/href/query semantics를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard 자체를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- 이번 라운드는 no-selection / no-runs helper wording과 direct verification만 다뤘고 run/report schema, compare 계산, delete/restore, report href contract는 건드리지 않았다.
- current 구현에서는 run 목록이 있으면 첫 실행이 자동 선택되므로, `runs가 존재하지만 선택만 비어 있는 상태`는 일반 사용자 흐름에서 거의 드러나지 않는다. 이번 representative e2e는 `선택된 실행 없음 + 저장된 실행 없음` 조합에서 fallback copy를 직접 검증한 것이다.
- `/planning/runs`는 계속 stable history/comparison surface이고 `/planning/reports`는 저장 결과 확인 도착점으로 유지된다. route inventory나 entry policy는 다시 열지 않았다.
