# 2026-03-26 v3 import-to-planning beta stable planning quickstart report handoff alignment implementation

## 변경 파일
- `src/app/planning/_lib/workspaceQuickStart.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `src/components/planning/PlanningQuickStartGate.tsx`
- `tests/planning/ui/workspaceQuickStart.test.ts`
- `tests/e2e/planning-quickstart-preview.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-stable-planning-quickstart-report-handoff-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: stable `/planning` quickstart copy 변경을 UI text + user-flow 영향으로 분류하고 `test`, `lint`, `build`, `e2e:rc`, `git diff --check`까지 최소 검증 세트를 고르기 위해 사용.
- `route-ssot-check`: `/planning`, `/planning/runs`, `/planning/reports`, `/planning/reports/[id]`가 계속 stable public route로 유지되고 이번 라운드가 route/href 변경 없이 wording 정렬만 다루는지 확인하기 위해 사용.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 미실행 조건부 검증, 남은 리스크를 오늘 `/work` 표준 형식으로 남기기 위해 사용.

## 변경 이유
- v3 import-to-planning beta funnel의 마지막 구간은 `draft apply -> stable /planning?profileId=... -> 첫 실행 -> 결과 저장 -> stable report`인데, stable planning workspace의 quickstart status와 follow-through copy는 아직 그 흐름을 충분히 또렷하게 드러내지 못했다.
- 이번 라운드는 redirect/handoff 구조와 planning engine semantics는 그대로 두고, stable `/planning` 안의 quickstart / next-step / report 도착 문맥만 representative funnel 기준으로 읽기 쉽게 정리하는 것이 목적이었다.

## 핵심 변경
- `workspaceQuickStart.ts`의 quickstart VM을 `프로필 저장 -> 첫 실행 -> 결과 저장 -> 리포트 확인` 4단계로 다시 읽히게 좁히고, save 완료 상태 요약과 next-step summary를 `저장된 리포트 확인` 문맥으로 맞췄다.
- `PlanningWorkspaceClient.tsx`에서 quickstart notice, next-step helper, beginner progress grid wording을 조정해 `/planning/reports`가 stable entry가 아니라 결과 저장 뒤 확인하는 도착점으로 읽히게 맞췄다.
- `PlanningWorkspaceClient.tsx`의 beginner run 완료 notice를 `첫 실행과 결과 저장 완료` 기준으로 바꿔 실제 auto-save 동작과 toast 문구가 어긋나지 않게 했다.
- `PlanningQuickStartGate.tsx`의 applied/restored follow-through copy를 같은 톤으로 정리해 `결과 저장 후 리포트 확인` 흐름이 stable workspace card와 충돌하지 않게 맞췄다.
- `tests/planning/ui/workspaceQuickStart.test.ts`와 `tests/e2e/planning-quickstart-preview.spec.ts` 기대 문자열을 업데이트해 4단계 quickstart summary와 report handoff wording을 검증했다.

## 검증
- `pnpm test tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/planningQuickStartGate.test.tsx`
- `pnpm lint`
  - 결과: PASS
  - 비고: 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- `pnpm build`
  - 결과: PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
  - 결과: PASS
  - 비고: 첫 `pnpm e2e:rc`에서 quickstart toast 기대 문자열 1건이 실패해 좁은 재현으로 수정 확인 후 전체 RC를 다시 실행했다.
- `pnpm e2e:rc`
  - 결과: PASS
- `git diff --check -- src/components/PlanningWorkspaceClient.tsx src/components/planning/PlanningQuickStartGate.tsx src/app/planning/_lib/workspaceQuickStart.ts src/app/planning/_lib/planningQuickStart.ts tests/planning/ui/workspaceQuickStart.test.ts tests/e2e/planning-quickstart-preview.spec.ts work/3/26/2026-03-26-v3-import-to-planning-beta-stable-planning-quickstart-report-handoff-alignment-implementation.md`
- [미실행] `tests/planning-reports-page-fallback.test.tsx` — `/planning/reports` page contract, fallback loader, href를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:current-screens:guard` — route inventory/classification이나 href를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard 자체를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- 이번 라운드는 stable `/planning` 내부 copy/handoff alignment만 다뤘고, `window.location.href = /planning?profileId=...`로 들어온 뒤 별도 auto-scroll, auto-focus, auto-open 같은 handoff mechanics는 바꾸지 않았다.
- `PlanningWorkspaceClient`의 beginner run은 여전히 `run + savedRun`을 같은 action으로 완료한다. 이번 라운드는 그 semantics를 유지한 채 사용자 노출 문구만 실제 동작에 맞춰 보정했다.
- `pnpm lint` warning 25건은 이번 변경과 무관한 기존 상태라 그대로 남겼다.
