# 2026-06-23 v2 action-progress service boundary

## 변경 파일
- `src/app/api/planning/v2/runs/[id]/action-progress/route.ts`
- `src/lib/planning/server/runs/routeService.ts`
- `tests/planning-v2-api/run-action-progress-route.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzzzzzzzzzz-v2-action-progress-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 이번 구현 라운드에 기본 적용할 planning/work closeout skill 조합을 확인했습니다.
- `planning-gate-selector`: v2 App Router route 변경에 필요한 targeted test, build, v2 complete/regress 게이트를 골랐습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 리스크를 `/work` 기록으로 남겼습니다.

## 변경 이유
- [사실] 이전 라운드에서 v2 `runs/[id]` detail/action-plan route는 service boundary로 이동했지만, `runs/[id]/action-progress` route는 `server/runs/repository`와 progress summary 계산을 직접 import하고 있었습니다.
- [사실] legacy `/api/planning/runs/[id]/action-progress` route는 v2 action-progress route를 delegate하므로, v2 route boundary 정리는 legacy 경로에도 그대로 적용됩니다.
- [해석] route handler는 same-origin/CSRF, auth, 입력 검증, 응답 매핑만 담당하고, current-user progress read/update/summary projection은 run route service에서 처리하는 편이 사용자 소유권 경계 고정 목표에 맞습니다.

## 핵심 변경
- `routeService.ts`에 `getCurrentUserRunActionProgressResult`와 `patchCurrentUserRunActionProgress`를 추가해 progress read/update와 summary projection을 service로 옮겼습니다.
- v2 action-progress route는 repository import를 제거하고 service 함수만 호출하도록 정리했습니다.
- public response shape는 기존처럼 `data`에 progress, `meta.summary`에 progress summary, `meta.userId/authSource`를 유지했습니다.
- action-progress route 테스트에 source boundary assertion을 추가해 direct repository/summarizer import 재발을 막았습니다.
- route path, href, `docs/current-screens.md`는 변경하지 않았습니다.

## 검증
- `git status --short --branch` PASS: `main...origin/main` clean에서 시작 후 `codex/action-progress-service-boundary` 브랜치 생성
- `git fetch origin main` PASS: `origin/main`은 `d68ff4616a47d89c12f242ed48d9d5729179a9de`
- `corepack pnpm test tests/planning-v2-api/run-action-progress-route.test.ts tests/planning-v2-api/run-detail-route-fallback.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm build` PASS
- `git diff --check` PASS
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:regress` PASS

## 남은 리스크
- [리스크] 이번 PR은 action-progress route 경계 정리에 한정했습니다. `/planning/runs` list/page 쪽의 summary 계산이나 추가 repository boundary 확장은 별도 후속 PR로 분리해야 합니다.
- [리스크] `pnpm planning:v2:compat`는 실행하지 않았습니다. 저장소 migration/legacy fixture를 바꾸지 않았고, legacy proxy 계약은 targeted route test와 v2 complete/regress로 확인했습니다.
- [리스크] Spark 조건부 지침은 인지했지만 이번 라운드는 manager 에이전트 분석과 메인 에이전트 최종 검증으로 충분해 Spark 신규 작업은 맡기지 않았습니다.

## 다음 라운드 우선순위
1. `src/app/api/planning/v2/runs/[id]/blob/[name]/route.ts`의 direct repository/sanitizer 접근을 service boundary 후보로 검토합니다.
2. v2 route boundary 정리 후 `src/app/api/planning/v2` 전체 direct repository import 현황을 다시 스캔합니다.
3. v3 route handler의 repository 직접 접근 후보군을 별도 라운드로 분류합니다.
