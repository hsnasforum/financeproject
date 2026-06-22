# 2026-06-22 ops success meta coverage

## 요약
- user-owned ops API의 JSON 성공 응답도 route user metadata를 포함하도록 정적 계약을 확장했습니다.
- `/api/ops/backup/preview`, `/api/ops/backup/restore` 성공 응답에 `meta.userId/authSource`를 추가했습니다.
- `securityUserMeta`, `assumptionsUserMeta`, `doctorRouteMeta` wrapper가 `planningUserMeta` 기반인지 검사합니다.
- raw 다운로드 응답인 `/api/ops/backup/export`는 JSON 본문이 없어 이번 meta 응답 계약 대상에서 제외했습니다.

## 변경 파일
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `src/app/api/ops/backup/preview/route.ts`
- `src/app/api/ops/backup/restore/route.ts`

## 사용 skill
- `finance-skill-routing`: Finance Project 범위에서 필요한 skill 선택에 사용했습니다.
- `planning-gate-selector`: route/auth 변경에 맞는 검증 범위 선택에 사용했습니다.
- `work-log-closeout`: `/work` 종료 기록 형식과 포함 항목 확인에 사용했습니다.

## 검증
- PASS `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/auth/routeAuth.test.ts`
- PASS `corepack pnpm planning:auth:check`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm build`

## 남은 리스크
- user-owned ops raw/stream 응답은 JSON meta를 실을 수 없으므로 별도 헤더 계약이 필요하면 후속 라운드에서 설계해야 합니다.
- repository ownership boundary 테스트는 이번 라운드 범위 밖입니다.

## 다음 우선순위
1. repository ownership boundary 테스트 후보를 1~2개 surface로 좁혀 보강합니다.
2. PostgreSQL readiness 쪽 manifest/export/dry-run checksum 게이트 후보를 확인합니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
