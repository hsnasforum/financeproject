# 2026-06-23 reports list create route service boundary

## 변경 파일
- `src/app/api/planning/v2/reports/route.ts`
- `src/lib/planning/server/reports/routeService.ts`
- `tests/planning-v2-api/reports-route.test.ts`
- `work/6/23/2026-06-23-reports-list-create-route-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`의 남은 리스크를 기준으로 이번 라운드 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: planning v2 reports API route 변경에 맞는 테스트, lint, build, v2 complete/regress 게이트를 선정했습니다.
- `work-log-closeout`: 실행한 검증과 남은 리스크만 `/work`에 기록하는 형식을 맞췄습니다.
- Spark 조건부 지침은 인지했지만, 이번 대상은 파일 범위가 좁아 추가 Spark 조사 없이 manager 분해와 메인 구현으로 진행했습니다.

## 변경 이유
- top-level `/api/planning/v2/reports` list/create route가 reports repository를 직접 import해 route handler가 저장소 접근과 list DTO 조립을 맡고 있었습니다.
- 사용자 소유권과 route/service 책임 경계를 맞추기 위해 list/create repository 접근과 응답 데이터 조립을 `reports/routeService.ts`로 이동했습니다.
- route는 same-origin/CSRF guard, auth, query/body 입력 파싱, `planningUserMeta` 포함 응답 매핑을 유지합니다.

## 핵심 변경
- `listCurrentUserReportResponseData(limit)`를 추가해 report list DTO 조립을 service 계층으로 이동했습니다.
- `createCurrentUserReportResponseData({ runId, recommendRunId })`를 추가해 report create repository 호출을 service 계층으로 이동했습니다.
- `/api/planning/v2/reports/route.ts`는 `routeService`만 import하고 기존 `limit` clamp, `runId` 필수 검증, 201 응답, `NO_DATA` 매핑을 유지합니다.
- `reports-route.test.ts`에 list/create route가 reports repository를 직접 import하지 않는 source-boundary 회귀 테스트를 추가했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/reports-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` 통과
- `corepack pnpm lint` 통과
- `corepack pnpm build` 통과
- `corepack pnpm planning:v2:complete` 통과
- `corepack pnpm planning:v2:regress` 통과, regression 9개와 full e2e 8개 통과

## 남은 리스크
- reports v2 API route의 직접 repository import는 이번 범위에서 닫았지만, 다른 planning v2 route에 남은 직접 service/repository 경계 후보는 별도 스캔이 필요합니다.
- 전역 coverage 테스트에 “reports route repository 직접 import 금지” 규칙을 일반화하지는 않았습니다. 이번 PR은 local source-boundary 회귀 테스트로 제한했습니다.
- GitHub Actions의 `BlobNotFound` failure 패턴은 원격 PR 생성 후 다시 확인해야 합니다.
