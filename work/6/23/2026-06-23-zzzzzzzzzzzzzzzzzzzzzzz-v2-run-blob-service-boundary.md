# 2026-06-23 v2 run blob service boundary

## 변경 파일
- `src/app/api/planning/v2/runs/[id]/blob/[name]/route.ts`
- `src/lib/planning/server/runs/routeService.ts`
- `tests/planning-v2-api/run-blob-route.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzzzzzzzzzzz-v2-run-blob-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 구현 라운드에 필요한 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: v2 App Router blob route 변경에 필요한 targeted test, build, v2 complete/regress 게이트를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 리스크를 `/work` 기록으로 남겼습니다.

## 변경 이유
- [사실] 이전 라운드에서 v2 run detail/action-plan/action-progress route는 service boundary로 이동했지만, `runs/[id]/blob/[name]` route는 `server/runs/repository`와 `runResponseSanitizer`를 직접 import하고 있었습니다.
- [사실] legacy `/api/planning/runs/[id]/blob/[name]` route는 v2 blob route를 delegate하므로, v2 route boundary 정리는 legacy 경로에도 적용됩니다.
- [해석] route handler는 same-origin/CSRF, auth, preview/gzip 응답 매핑만 담당하고, current-user blob read와 sanitizer projection은 run route service에서 처리하는 편이 사용자 소유권 경계 고정 목표에 맞습니다.

## 핵심 변경
- `routeService.ts`에 `getCurrentUserRunBlobResponseData`를 추가해 current-user blob read와 `sanitizeRunBlobForResponse`를 service로 이동했습니다.
- v2 blob route는 repository/sanitizer import를 제거하고 service 함수만 호출하도록 정리했습니다.
- blob route의 `NO_DATA`/`INTERNAL` 오류 응답에 `meta.userId/authSource`를 유지하도록 맞췄습니다.
- `run-blob-route.test.ts`에 v2/legacy route source boundary assertion을 추가했습니다.
- route path, href, `docs/current-screens.md`는 변경하지 않았습니다.

## 검증
- `git status --short --branch` PASS: `main...origin/main` clean에서 시작 후 `codex/run-blob-service-boundary` 브랜치 생성
- `git fetch origin main` PASS: `origin/main`은 `0c7853504d0378d9c667eddd004396120277794d`
- `corepack pnpm test tests/planning-v2-api/run-blob-route.test.ts tests/planning-v2-api/run-detail-route-fallback.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm build` PASS
- `git diff --check` PASS
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:regress` PASS

## 남은 리스크
- [리스크] 이번 PR은 blob route 경계 정리에 한정했습니다. `src/app/api/planning/v2/runs/route.ts`의 list/create direct repository/sanitizer 접근은 별도 후속 PR로 분리해야 합니다.
- [리스크] `pnpm planning:v2:compat`는 실행하지 않았습니다. 저장소 migration/legacy fixture를 바꾸지 않았고, legacy proxy 계약은 targeted route test와 v2 complete/regress로 확인했습니다.
- [리스크] Spark 조건부 지침은 인지했지만 이번 라운드는 manager 에이전트 분석과 메인 에이전트 최종 검증으로 충분해 Spark 신규 작업은 맡기지 않았습니다.

## 다음 라운드 우선순위
1. `src/app/api/planning/v2/runs/route.ts`의 list/create direct repository/sanitizer 접근을 service boundary 후보로 검토합니다.
2. v2 route boundary 정리 후 `src/app/api/planning/v2` 전체 direct repository import 현황을 다시 스캔합니다.
3. v3 route handler의 repository 직접 접근 후보군을 별도 라운드로 분류합니다.
