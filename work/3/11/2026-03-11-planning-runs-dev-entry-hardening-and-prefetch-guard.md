# 2026-03-11 planning/runs dev entry hardening and prefetch guard

## 수정 대상 파일
- `src/lib/navigation/prefetch.ts`
- `src/components/SiteHeader.tsx`
- `src/components/ui/MobileBottomNav.tsx`
- `src/components/HomePortalClient.tsx`
- `src/components/DashboardClient.tsx`
- `src/components/home/ServiceLinks.tsx`
- `src/components/home/QuickTiles.tsx`
- `src/components/home/TodayQueue.tsx`
- `src/components/home/HomeHero.tsx`
- `src/components/ui/BodyTone.tsx`
- `src/components/PlanningWorkspaceClient.tsx`
- `src/app/planning/runs/page.tsx`

## 변경 이유
- 남은 dev classify에서 `/planning/runs` 첫 진입 실패와 `planning-runs-link` 이동 경합이 다시 한 번 재현됐다.
- 공통 네비게이션과 홈/브리핑 화면의 planning 계열 링크 prefetch가 dev compile fan-out를 키우는 축으로 남아 있었다.
- `/planning/runs`는 dev에서 서버 기본 프로필 조회를 먼저 타며 간헐 `500` 흔적이 보였다.

## 무엇이 바뀌었는지
- dev에서만 `/planning*` 링크 prefetch를 끄는 `devPlanningPrefetch()` helper를 추가하고, 공통 헤더/하단 네비게이션/홈/브리핑의 planning 계열 링크에 적용했다.
- `planning-runs-link`는 Next `Link` 대신 단순 anchor로 바꾸고 `window.location.assign()`만 유지해 hydration/HMR 경합에서도 `/planning/runs` 이동을 더 안정적으로 만들었다.
- `/planning/runs` 페이지는 dev에서 서버 기본 프로필 조회를 건너뛰고 client fetch로 바로 넘기도록 줄였다.
- `BodyActionLink` 공통 class를 export해 위 anchor 전환에도 같은 UI 톤을 유지했다.

## 검증 명령
- `pnpm exec eslint src/lib/navigation/prefetch.ts src/components/SiteHeader.tsx src/components/ui/MobileBottomNav.tsx src/components/HomePortalClient.tsx src/components/DashboardClient.tsx src/components/home/ServiceLinks.tsx src/components/home/QuickTiles.tsx src/components/home/TodayQueue.tsx src/components/home/HomeHero.tsx`
- `pnpm exec eslint src/components/ui/BodyTone.tsx src/components/PlanningWorkspaceClient.tsx`
- `pnpm exec eslint src/app/planning/runs/page.tsx src/components/PlanningWorkspaceClient.tsx src/components/ui/BodyTone.tsx`
- `pnpm e2e:pw tests/e2e/dart-flow.spec.ts tests/e2e/flow-history-to-report.spec.ts tests/e2e/flow-planner-to-history.spec.ts --workers=1`
- `pnpm e2e:pw tests/e2e/flow-planner-to-history.spec.ts --workers=1 --repeat-each=5`
- `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3306`
- `pnpm build`

## 결과
- eslint PASS
- 대상 Playwright PASS
- `flow-planner-to-history` 반복 5회 PASS
- dev classify `pass=3/3`
- `pnpm build` PASS

## 남은 리스크
- dev webpack runtime 로그로 `Fast Refresh had to perform a full reload`는 여전히 남는다.
- 이번 라운드 기준으로는 `/planning/runs 500`과 `planning-runs-link` 실제 이동 실패는 다시 재현되지 않았다.
- `Fast Refresh`는 현재 모두 최종 PASS로 복구되며, 앱 기능 실패보다 Next dev runtime noise에 더 가깝다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
