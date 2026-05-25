# 2026-04-11 Planning Workspace 2차 리팩터링

## 변경 파일
- `src/components/PlanningWorkspaceClient.tsx`
- `src/components/planning/workspace/controllerUtils.ts`
- `src/components/planning/workspace/executionOptions.ts`
- `src/components/planning/workspace/groups.ts`
- `src/components/planning/workspace/panels.tsx`
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/DartSearchClient.tsx`
- `tests/planning/ui/workspaceGroups.test.ts`

## 사용 skill
- `planning-gate-selector`: workspace 추출 후 필요한 lint/test/build/e2e 게이트를 최소 세트로 고정
- `dart-data-source-hardening`: full e2e에서 재현된 DART monitor 진입 경쟁 상태를 실패 모드 기준으로 좁혀 안정화
- `work-log-closeout`: 오늘자 `/work/4/11/` closeout 형식 정리

## 변경 이유
- `PlanningWorkspaceClient` 계열 내부 구조를 정리하면서 공개 props, query/storage 계약, 사용자 문구, `data-testid`, 버튼 상태, 포커스 이동을 유지해야 했습니다.
- workspace 타깃 eslint warning을 0으로 만들고 panel/view 분리를 끝내야 했습니다.
- 검증 단계에서 `tests/e2e/dart-flow.spec.ts:60`이 full suite에서만 다시 재현되어, 이번 라운드 게이트를 막는 DART monitor hydration 경쟁 상태를 함께 정리할 필요가 생겼습니다.

## 핵심 변경
- `PlanningWorkspaceClient`를 route-facing entry로 축소하고 controller 호출, grouped selector 적용, `PageShell`/`PageHeader`, 5개 panel 배치만 남겼습니다.
- workspace-local selector `groups.ts`와 view module `panels.tsx`를 추가해 `{ quickStart, profile, execution, results, dialogs, actions }` grouped contract를 client 밖으로 이동했습니다.
- controller와 client에 남아 있던 미사용 import/helper를 정리해 workspace eslint 타깃 warning을 0으로 맞췄습니다.
- `tests/planning/ui/workspaceGroups.test.ts`를 추가해 grouped selector shape와 핵심 binding이 기존 flat controller 계약과 동일한지 검증했습니다.
- quickstart review fallback에서 `planning-quickstart-runs-link` 강조 톤을 기존 emerald class로 복원해 e2e 회귀를 제거했습니다.
- `DartSearchClient` 탭 버튼을 hydration 전에는 비활성화해 full suite 부하 시 monitor 탭 클릭이 유실되던 경쟁 상태를 막았습니다.

## 검증
- `pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/**/*.ts* tests/planning/ui/workspaceGroups.test.ts` -> 통과
- `pnpm test tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceGroups.test.ts` -> 6 files / 28 tests 통과
- `pnpm lint` -> exit 0, workspace warning 없음. [미해결] repository 다른 영역 warning 24건은 그대로 남음
- `pnpm build` -> 통과
- `pnpm e2e:rc` -> 1차 실행 실패 (`tests/e2e/dart-flow.spec.ts:60`, `tests/e2e/planning-quickstart-preview.spec.ts:168`)
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1` -> 3 passed
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/dart-flow.spec.ts --workers=1` -> 3 passed
- `pnpm exec eslint src/components/DartSearchClient.tsx src/components/DartDisclosureMonitorClient.tsx` -> 통과
- `pnpm e2e:rc` -> 22 passed
- `pnpm build` -> 통과

## 남은 리스크
- 저장소 전체 기준 unrelated lint warning 24건은 남아 있습니다. 이번 라운드 범위 밖이라 미처리했습니다.
- `src/components/planning/workspace/`는 panel/view 1차 추출까지 완료된 상태라, 다음 라운드에서 panel fan-out과 hook grouped return 전환 여부를 다시 판단할 수 있습니다.
- DART monitor는 hydration 경쟁 상태 기준으로는 재현이 멈췄지만, 외부 공시/공공데이터 응답 지연이나 upstream 오류 자체는 계속 별도 운영 리스크로 남습니다.
