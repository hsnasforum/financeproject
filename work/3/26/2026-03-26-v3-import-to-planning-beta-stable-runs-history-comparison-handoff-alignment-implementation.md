# 2026-03-26 v3 import-to-planning beta stable-runs-history-comparison-handoff alignment implementation

## 변경 전 메모
1. 수정 대상 파일
- `src/components/PlanningRunsClient.tsx`
- 필요하면 `src/app/planning/runs/page.tsx`
- 필요하면 관련 테스트 파일
2. 변경 이유
- `/planning/reports` destination wording은 맞춰졌지만, `/planning/runs`는 아직 import-to-planning beta funnel의 stable history/comparison 도착점 문맥으로 완전히 정리되지 않았다.
3. 실행할 검증 명령
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- 필요하면 관련 테스트 추가 또는 확장

## 변경 파일
- `src/components/PlanningRunsClient.tsx`
- `tests/e2e/flow-planner-to-history.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-stable-runs-history-comparison-handoff-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: wording-only batch에 맞는 최소 검증 세트를 `lint`, `build`, `e2e:rc`로 고르고 조건부 미실행 가드를 정리하기 위해 사용.
- `route-ssot-check`: `/planning/runs`, `/planning/runs/[id]`, `/planning/reports`의 stable/public route 계약을 유지한 채 copy만 다루는지 확인하기 위해 사용.
- `work-log-closeout`: 변경 전 메모를 먼저 남기고, 구현 후 실제 변경/검증/남은 리스크를 같은 경로의 `/work` 문서로 닫기 위해 사용.

## 변경 이유
- stable `/planning/reports` 도착점 wording은 정리됐지만, `/planning/runs`의 header/helper/empty-state는 아직 `저장된 실행 비교 -> 상세 리포트 이동`이라는 stable history/comparison 문맥이 충분히 또렷하지 않았다.
- 이번 라운드는 route, href, query, compare/report contract를 건드리지 않고 `/planning/runs`를 `플래닝에서 저장한 실행을 다시 읽고 비교한 뒤 상세 리포트로 이어 가는 후속 기록/비교 화면`으로 더 자연스럽게 읽히게 만드는 smallest safe batch가 목적이었다.

## 핵심 변경
- `src/components/PlanningRunsClient.tsx`의 `PageHeader` 설명과 상단 helper 문구를 `/planning/runs`가 첫 진입점이 아니라 `저장된 실행을 다시 읽고 비교한 뒤 상세 리포트로 이어 보는 후속 기록 단계`라는 문맥으로 다시 썼다.
- 같은 파일의 `실행 목록` 설명과 빈 상태 문구를 `먼저 플래닝에서 실행 저장 -> runs에서 실행끼리 비교 -> 상세 리포트 이동` 흐름이 더 바로 읽히는 쉬운 한국어로 정리했다.
- `실행 기록 상세`와 `실행 비교 요약` 카드의 보조 문구를 조정해, 선택한 실행을 다시 읽는 축과 두 실행을 비교한 뒤 상세 비교 리포트로 이어 가는 축을 더 분명히 나눴다.
- 기존 selector/data-testid인 `runs-print-button`, `planning-runs-table`과 `/planning`, `/planning/reports?...` 링크 계약은 그대로 유지했다.
- `tests/e2e/flow-planner-to-history.spec.ts`에 `/planning -> /planning/runs` 도착 직후 새 history/comparison helper 문구가 보이는지 확인하는 assertion을 추가했다.

## 검증
- `pnpm lint`
  - 결과: PASS
  - 비고: 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- `pnpm build`
  - 결과: PASS
- `pnpm e2e:rc`
  - 결과: PASS
- `git diff --check -- src/components/PlanningRunsClient.tsx src/app/planning/runs/page.tsx src/app/planning/runs/[id]/page.tsx tests/e2e/flow-planner-to-history.spec.ts tests/e2e/flow-history-to-report.spec.ts tests/e2e/planning-v2-fast.spec.ts work/3/26/2026-03-26-v3-import-to-planning-beta-stable-runs-history-comparison-handoff-alignment-implementation.md`
  - 결과: PASS
- [미실행] `pnpm planning:current-screens:guard` — route/href/query semantics를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard 자체를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- 이번 라운드는 wording만 조정했고 compare mode, delete/restore, JSON copy, run selection, report href contract는 건드리지 않았다. `/planning/runs`의 stable history/comparison tier는 더 분명해졌지만 동작 계약은 그대로다.
- e2e는 대표 도착 경로인 `/planning -> /planning/runs`에서 공통 helper 문구가 보이는지까지 확인했고, 선택 실행/비교 실행 상태별 세부 보조 문구는 컴포넌트 정적 변경으로만 검토했다.
- `/planning/runs`와 `/planning/reports`의 역할 분리는 copy에서만 더 선명해졌고, IA나 entry policy 자체는 다시 열지 않았다.

## 이번 라운드 완료 항목
- stable `/planning/runs` header/helper/empty-state/selected-run helper wording 정리
- `/planning -> /planning/runs` representative e2e 보강
- route/href/query semantics 유지 상태에서 follow-through history/comparison tier 명확화

## 다음 라운드 우선순위
- [검증 필요] `/planning/runs`에서 실제 선택 실행 상태와 비교 실행 상태를 각각 가진 fixtures로 세부 helper 문구까지 직접 검증할지 판단
- [검증 필요] representative funnel의 남은 stable follow-through surfaces 중 wording만 남은 표면이 있는지 `/work` 기준으로 재확인
