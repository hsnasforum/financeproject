# 2026-06-23 planning rsc page loader boundary

## 변경 파일
- `src/lib/planning/server/pages/planningRscLoaders.ts`
- `src/app/planning/page.tsx`
- `src/app/planning/runs/page.tsx`
- `src/app/planning/reports/[id]/page.tsx`
- `tests/planning/auth/planningPageUserScopeCoverage.test.ts`
- `work/6/23/2026-06-23-planning-rsc-page-loader-boundary.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 작업 라운드의 조건부 skill 적용 범위를 확인했습니다.
- `planning-gate-selector`: RSC 초기 데이터 경계 변경에 맞는 최소 검증 세트를 골랐습니다.
- `work-log-closeout`: 종료 기록의 필수 항목과 검증 결과 형식을 맞췄습니다.

## 변경 이유
- `/planning`, `/planning/runs`, `/planning/reports/[id]` 페이지가 current-user repository를 직접 조합하던 초기 데이터 로드를 별도 서버 로더로 모아 pageAuth 경계를 더 명확하게 만들었습니다.
- 페이지 컴포넌트는 URL 입력 정규화와 클라이언트 컴포넌트 전달에 집중하고, 사용자 소유 데이터 조회는 `planningRscLoaders.ts` 내부의 `withCurrentPlanningPageUser` 콜백에서만 실행되게 했습니다.
- shared assumptions snapshot 로드는 기존처럼 pageAuth 밖의 shared read로 유지하되, user-owned 초기 프로필 로더보다 먼저 실행된다는 coverage를 갱신했습니다.

## 핵심 변경
- 새 `planningRscLoaders.ts`에 workspace profile, runs list/action progress, report detail 초기 데이터 로더를 추가했습니다.
- `/planning`, `/planning/runs`, `/planning/reports/[id]` 페이지의 직접 repository/pageAuth 조합을 새 로더 호출로 대체했습니다.
- action progress 조회 헬퍼는 정적 검사에서도 pageAuth 내부 조회로 보이도록 로더 콜백 내부에 유지했습니다.
- `planningPageUserScopeCoverage.test.ts`에 RSC loader pageAuth 경계 회귀 테스트를 추가했습니다.

## 검증
- `corepack pnpm test tests/planning/auth/planningPageUserScopeCoverage.test.ts tests/planning-reports-page-fallback.test.tsx tests/planning/auth/reportRunScopeLoaderPageAuth.test.ts` 통과
- `corepack pnpm lint` 통과
- `corepack pnpm build` 1차는 184초 제한으로 timeout, 600초 제한 재실행 통과
- `corepack pnpm planning:v2:e2e:fast` 통과, 6개 테스트

## 남은 리스크
- 이번 PR은 RSC 초기 데이터 경계 정리에 한정했고, `/api/planning/v2/reports/[id]` route service 분리는 다음 라운드 후보로 남았습니다.
- `planning:v2:e2e:fast` 범위 밖의 전체 `e2e:rc`는 실행하지 않았습니다. UI selector 자체 변경은 없지만 전체 smoke가 필요한 릴리스 직전에는 별도 실행이 필요합니다.
