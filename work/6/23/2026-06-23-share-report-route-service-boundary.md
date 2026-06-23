# 2026-06-23 share-report route service boundary

## 요약
- `/api/planning/v2/share-report` GET/POST route의 직접 repository import를 제거하고 `share/routeService` 경계 뒤로 이동했습니다.
- route는 기존처럼 guard/auth/input parsing/error mapping/JSON 응답만 담당합니다.
- share report 생성 응답과 목록 응답의 public payload shape(`id`, `runId`, `level`, `createdAt`)는 유지했습니다.
- `share-report-route.test.ts`에 생성 후 목록 조회 회귀와 route-service boundary 정적 가드를 추가했습니다.

## 수정 파일
- `src/app/api/planning/v2/share-report/route.ts`
- `src/lib/planning/server/share/routeService.ts`
- `tests/planning-v2-api/share-report-route.test.ts`

## 사용 skill
- `finance-skill-routing`: Finance Project 라운드에 필요한 기본 skill 선택 확인.
- `planning-gate-selector`: v2 API route/core 변경에 필요한 검증 게이트 선정.
- `work-log-closeout`: 변경 후 `/work` 종료 기록 형식 확인.

## 서브에이전트
- `manager`: planning v2 route direct boundary 후보를 분해했습니다.
- 결과: `share-report` repository 직접 import와 `monte-carlo` auditLogStore 직접 import 2개 후보 확인.
- 판단: 이번 PR은 작은 범위의 `share-report`를 처리하고, `monte-carlo`는 다음 라운드 후보로 남겼습니다.
- Spark 조건부 지침: 이번 작업은 manager role 도구가 고정 모델을 사용했고, 즉시 막는 route/service 수정과 최종 검증은 메인 에이전트가 단일 소유자로 처리했습니다.

## 실행한 검증
- `corepack pnpm test tests/planning-v2-api/share-report-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm build` PASS
  - 첫 실행은 184초 tool 제한에서 timeout됐지만 WSL 내부 build 프로세스가 계속 실행 중임을 확인했고, 종료 후 긴 제한으로 재실행해 PASS를 캡처했습니다.
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:regress` PASS
- `git diff --check` PASS

## 남은 리스크
- `share/routeService`는 현재 payload mapping만 담당하므로 저장소 경계 자체는 `share/repository`에 남아 있습니다.
- 정적 스캔 기준 planning v2 route direct boundary 후보로 `src/app/api/planning/v2/monte-carlo/route.ts`의 `auditLogStore` 직접 import가 남아 있습니다.

## 다음 라운드 우선순위
1. `monte-carlo` budget reject audit append를 route service 또는 audit service 경계로 이동.
2. planning v2 route direct repository/storage/audit import 스캔을 PR 후 재실행.
3. main fast-forward 후 dirty worktree가 다시 쌓이지 않도록 PR 단위로 즉시 merge/cleanup.
