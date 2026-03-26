# 2026-03-26 v3 import-to-planning beta runs-selected-compare-state helper alignment implementation

## 변경 전 메모
1. 수정 대상 파일
- `src/components/PlanningRunsClient.tsx`
- 필요하면 관련 테스트 파일
2. 변경 이유
- `/planning/runs` landing 문맥은 맞춰졌지만, selected-run helper와 compare-summary helper는 현재 정적 검토 위주라 실제 사용자 상태별 문구가 같은 톤으로 충분히 닫혔는지 추가 정리가 필요하다.
3. 실행할 검증 명령
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- 필요하면 관련 테스트 추가 또는 확장

## 변경 파일
- `src/components/PlanningRunsClient.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-runs-selected-compare-state-helper-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: state-specific helper wording batch에 맞는 최소 검증 세트를 `lint`, `build`, `e2e:rc`, `git diff --check`로 유지하고 조건부 미실행 가드를 분리하기 위해 사용.
- `route-ssot-check`: `/planning/runs`, `/planning/runs/[id]`, `/planning/reports`의 stable/public route 계약과 href/query semantics를 유지한 채 helper wording만 다루는지 확인하기 위해 사용.
- `work-log-closeout`: 변경 전 메모를 먼저 남기고, 구현 후 실제 변경/검증/오염 방지 보정과 남은 리스크를 같은 `/work` 파일에 닫기 위해 사용.

## 변경 이유
- `/planning/runs` landing/helper wording은 이전 라운드에서 정리됐지만, 실제 선택 실행 상태와 비교 실행 상태에서 보이는 helper/next-step 문구는 아직 같은 톤으로 충분히 닫혔는지 직접 검증되지 않았다.
- 이번 라운드는 route, run/report contract, compare 계산, delete/restore, report href는 그대로 두고 `선택 실행 다시 읽기 -> 상세 리포트 이동`과 `두 실행 비교 -> 상세 비교 리포트 이동` 두 상태의 안내 문맥만 smallest safe batch로 더 직접적으로 정리하는 것이 목적이었다.

## 핵심 변경
- `src/components/PlanningRunsClient.tsx`의 `실행 기록 상세` card 설명, no-selection fallback, selected hero helper를 `선택한 실행의 저장 결과를 다시 읽고 바로 상세 리포트로 이어 간다`는 문맥으로 더 직접적으로 정리했다.
- 같은 card의 하단 보조 문구를 `상세 리포트는 이 실행 하나의 저장 결과를 다시 읽는 도착점`으로 바꿔 `/planning/runs`의 비교/히스토리 축과 `/planning/reports`의 결과 확인 축을 분리했다.
- `실행 비교 요약` card 설명과 empty fallback을 `두 실행 차이 확인 -> 상세 비교 리포트 이동` 흐름으로 더 직접적으로 바꿨고, compare result가 있을 때만 보이는 helper 한 줄을 추가했다.
- `tests/e2e/flow-history-to-report.spec.ts`에 seed된 두 실행으로 selected state와 compare state의 helper 문구를 모두 확인하는 테스트를 추가했다.
- 같은 e2e는 seed profile을 마지막에 `DELETE /api/planning/v2/profiles/[id]`로 정리해 뒤에 오는 `planning-quickstart-preview` beginner quickstart를 오염시키지 않도록 보정했다.

## 검증
- `pnpm lint`
  - 결과: PASS
  - 비고: 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- `pnpm build`
  - 결과: PASS
- `pnpm e2e:rc`
  - 결과: PASS
  - 비고: 첫 실행에서 새 seed profile이 quickstart preview를 오염시키는 실패를 확인했고, test cleanup을 추가한 뒤 전체 15개 테스트 통과로 재검증했다.
- `git diff --check -- src/components/PlanningRunsClient.tsx src/app/planning/runs/page.tsx src/app/planning/runs/[id]/page.tsx tests/e2e/flow-planner-to-history.spec.ts tests/e2e/flow-history-to-report.spec.ts tests/e2e/planning-v2-fast.spec.ts work/3/26/2026-03-26-v3-import-to-planning-beta-runs-selected-compare-state-helper-alignment-implementation.md`
  - 결과: PASS
- [미실행] `pnpm planning:current-screens:guard` — route/href/query semantics를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard 자체를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- 이번 라운드는 state-specific helper wording만 조정했고 compare 계산, run/report schema, delete/restore, JSON copy, report href contract는 건드리지 않았다.
- selected/compare 상태는 representative e2e로 직접 검증했지만, `실행 기록 상세` no-selection fallback 자체는 정적 문구 변경 기준으로만 확인했다.
- seed cleanup은 profile만 trash로 이동한다. 이 테스트가 만든 run record는 남지만 profile selection source를 정리하는 목적에는 충분했고, 현재 quickstart regression은 이 cleanup 이후 PASS로 확인됐다.

## 이번 라운드 완료 항목
- `/planning/runs` selected state helper와 compare state helper wording 정리
- selected/compare state representative e2e 추가
- seed cleanup 추가로 quickstart preview 오염 방지

## 다음 라운드 우선순위
- [검증 필요] `/planning/runs` no-selection fallback까지 사용자 흐름 안에서 직접 확인할 별도 대표 e2e가 필요한지 판단
- [검증 필요] state-specific helper 이후에도 `/planning/runs`에서 copy만 남은 surface가 있는지 `/work` 기준으로 다시 확인
