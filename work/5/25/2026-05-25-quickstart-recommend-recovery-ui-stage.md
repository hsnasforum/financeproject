# 2026-05-25 QuickStart/추천/복구 UI 안정화

## 변경 파일
- `src/components/RecommendHubClient.tsx`
- `src/components/RecoveryClient.tsx`
- `src/components/planning/PlanningQuickStartGate.tsx`
- `src/components/planning/workspace/panels/topSurfacePanel.tsx`
- `tests/e2e/planning-quickstart-preview.spec.ts`

## 사용 skill
- `planning-gate-selector`: hydration, 링크 navigation, 추천/복구 UI 변경에 맞는 lint, unit, e2e, build 범위 선정
- `route-ssot-check`: `/planning/runs` 링크 구조 변경이 실제 href와 문서 route 계약을 바꾸지 않는지 확인
- `work-log-closeout`: 검증 중 발견한 실패와 최종 PASS 결과 기록

## 변경 이유
- QuickStartGate는 SSR/hydration 전에도 입력과 CTA가 활성처럼 보일 수 있어, client hydration 전에는 상호작용을 막도록 했습니다.
- QuickStart 상단 실행 내역/리포트 링크는 `Link` 안에 `Button`을 중첩해 navigation 판정이 흔들릴 수 있어, 버튼처럼 보이는 실제 anchor로 바꿨습니다.
- Recommend 상품 로고는 `next/image` 대신 일반 `img` fallback을 사용해 없는 로고에서 요소를 숨기는 동작을 단순화했습니다.
- Recovery 오프라인 복구 결과 색상은 의미 토큰 `success`/`danger`로 맞췄습니다.

## Route SSOT 확인
- 실제 경로: 기존 `/planning/runs?profileId=...`, `/planning/reports...` 링크를 유지했습니다.
- 문서 기준과의 차이: public route 추가/삭제/redirect 변경 없음.
- 필요한 수정: `docs/current-screens.md` 갱신 불필요.
- 실행한 검증: runs 링크 e2e와 build 통과.
- 남은 리스크: 링크 시각 스타일은 Button class와 동등하게 맞췄지만, 공통 Button 컴포넌트를 직접 재사용하지는 않습니다.

## 검증
- `git diff --check -- src/components/RecommendHubClient.tsx src/components/RecoveryClient.tsx src/components/planning/PlanningQuickStartGate.tsx` PASS
- `git diff --check -- src/components/RecommendHubClient.tsx src/components/RecoveryClient.tsx src/components/planning/PlanningQuickStartGate.tsx src/components/planning/workspace/panels/topSurfacePanel.tsx tests/e2e/planning-quickstart-preview.spec.ts` PASS
- `corepack pnpm exec eslint src/components/RecommendHubClient.tsx src/components/RecoveryClient.tsx src/components/planning/PlanningQuickStartGate.tsx tests/planning/ui/planningQuickStartGate.test.tsx` PASS
- `corepack pnpm exec eslint src/components/RecommendHubClient.tsx src/components/RecoveryClient.tsx src/components/planning/PlanningQuickStartGate.tsx src/components/planning/workspace/panels/topSurfacePanel.tsx tests/e2e/planning-quickstart-preview.spec.ts` PASS
- `corepack pnpm test tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/recovery-reset.test.ts` PASS, 4 files / 14 tests
- `corepack pnpm exec playwright test tests/e2e/planning-quickstart-preview.spec.ts tests/e2e/flow-planner-to-history.spec.ts --workers=1 --reporter=line` PASS, 4 tests
- `corepack pnpm exec playwright test tests/e2e/smoke.spec.ts --grep 'recommend page renders' --workers=1 --reporter=line` PASS, 1 test
- `corepack pnpm build` PASS

## 특이 사항
- 첫 QuickStart e2e는 fallback 실행 내역 링크에서 서버 요청은 발생했지만 현재 page URL이 `/planning`에 머무르는 실패를 보였습니다.
- 원인은 중첩된 `Link > Button` 구조로 판단해 anchor 구조로 수정했고, 기존 `planning-runs-link` e2e 계약과 quickstart focus target을 함께 재검증했습니다.

## 남은 리스크
- 로고 파일 자체의 존재 여부나 이미지 품질은 이번 변경에서 검증하지 않았습니다.
- `.gitignore`, guidedoc ADS 삭제, 과거 `/work` untracked 문서는 이번 커밋 범위에 포함하지 않았습니다.
