# 2026-03-26 v3 import-to-planning beta planning-arrival next-step focus handoff implementation

## 변경 파일
- `src/app/planning/_lib/workspaceQuickStart.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `src/components/planning/PlanningQuickStartGate.tsx`
- `tests/e2e/planning-quickstart-preview.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-planning-arrival-next-step-focus-handoff-implementation.md`

## 사용 skill
- `planning-gate-selector`: 이번 배치가 UI mechanics + user-flow 영향만 가지는지 분류하고 실제 실행 검증/미실행 검증을 좁게 남기기 위해 사용.
- `route-ssot-check`: `/planning?profileId=...` stable arrival이 기존 `/planning`, `/planning/runs`, `/planning/reports` route 계약과 충돌하지 않는지 확인하기 위해 사용.
- `work-log-closeout`: 변경 전 메모를 먼저 남기고, 구현 후 실제 변경/검증/잔여 리스크를 같은 파일에 정리하기 위해 사용.

## 변경 이유
- stable `/planning` quickstart wording은 정리됐지만, `/planning?profileId=...` 도착 뒤 사용자가 실제 다음 버튼으로 바로 이어지는 auto-focus/auto-scroll mechanics는 아직 없다.
- 이번 라운드는 route, query, redirect 구조와 planning engine semantics는 그대로 두고, current quickstart VM이 이미 계산한 next-step target으로 one-shot handoff만 추가하는 smallest safe batch가 목적이었다.

## 핵심 변경
- `workspaceQuickStart.ts`에 `focusWorkspaceQuickStartTarget()` helper를 추가해 기존 next-step 버튼 클릭의 scroll+focus 동작을 shared helper로 고정했다.
- `PlanningQuickStartGate.tsx`는 위 helper를 재사용하도록 바꿔, 수동 `다음 단계` 버튼과 이번 arrival assist가 같은 target 이동 방식을 쓰게 맞췄다.
- `PlanningWorkspaceClient.tsx`에 `initialSelectedProfileId === selectedProfileId`일 때만 동작하는 one-shot arrival assist effect를 추가했다.
- 같은 effect는 현재 `quickStartNextStep.targetId`가 실제로 존재할 때만 실행하고, 사용자가 먼저 `pointerdown`/`keydown`/`wheel`로 조작하면 즉시 취소되도록 좁혔다.
- `tests/e2e/planning-quickstart-preview.spec.ts`에 `/planning?profileId=...` 재도착 직후 `planning-quickstart-run-cta`로 포커스가 이동하는 stable arrival 케이스를 추가했다.

## 검증
- `pnpm test tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/planningQuickStartGate.test.tsx`
  - 결과: PASS
- `pnpm lint`
  - 결과: PASS
  - 비고: 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- `pnpm build`
  - 결과: PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
  - 결과: PASS
  - 비고: 새 arrival focus 케이스 포함 3개 테스트가 모두 통과했다.
- `pnpm e2e:rc`
  - 결과: PASS
- `git diff --check -- src/components/PlanningWorkspaceClient.tsx src/components/planning/PlanningQuickStartGate.tsx src/app/planning/_lib/workspaceQuickStart.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/planningQuickStartGate.test.tsx tests/e2e/planning-quickstart-preview.spec.ts work/3/26/2026-03-26-v3-import-to-planning-beta-planning-arrival-next-step-focus-handoff-implementation.md`
- [미실행] `pnpm planning:current-screens:guard` — route inventory/classification, href, query contract를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard 자체를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- arrival assist는 `profileId` query가 실제 선택 프로필과 일치하는 초기 도착 1회만 돕는다. 사용자가 먼저 다른 곳을 조작하면 다시 이동시키지 않는 것이 의도지만, 이 취소 경계는 현재 `pointerdown`/`keydown`/`wheel` 기준이다.
- e2e는 대표 stable arrival인 `프로필 저장 완료 -> /planning?profileId=... -> 첫 실행` 포커스만 직접 검증했다. `결과 저장`, `리포트`, `실행 내역`, `프로필 저장/업데이트` target은 같은 shared helper와 `quickStartNextStep` 계산을 재사용하지만 개별 e2e는 아직 없다.
- `docs/current-screens.md`와 route catalog는 건드리지 않았다. 이번 라운드는 route semantics 변경이 없어서 문서/guard 업데이트도 하지 않았다.
