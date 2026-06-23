# 2026-06-23 reports detail route service boundary

## 변경 파일
- `src/app/api/planning/v2/reports/[id]/route.ts`
- `src/lib/planning/server/reports/routeService.ts`
- `tests/planning-v2-api/reports-route.test.ts`
- `work/6/23/2026-06-23-reports-detail-route-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드 기본 skill 조합과 조건부 skill 제외 여부를 확인했습니다.
- `planning-gate-selector`: planning v2 API route 변경에 필요한 테스트, lint, build, v2 complete/regress 게이트를 선정했습니다.
- `work-log-closeout`: `/work` 종료 기록 형식과 실행한 검증만 기록하는 원칙을 맞췄습니다.
- Spark 조건부 지침은 인지했지만, 이번 구현과 최종 검증은 메인 에이전트가 단일 소유했습니다.

## 변경 이유
- `/api/planning/v2/reports/[id]` route가 reports repository와 `auditLogStore`를 직접 import해 route handler가 저장소 접근과 trash audit 기록까지 맡고 있었습니다.
- 사용자 소유권과 route/service 책임 경계를 더 명확히 하기 위해 report detail read, soft delete, trash audit 기록을 reports route service로 이동했습니다.
- route는 same-origin/CSRF guard, auth, confirm 문구 검증, `planningUserMeta` 포함 응답 매핑만 유지합니다.

## 핵심 변경
- `reports/routeService.ts`를 추가해 report detail 응답 데이터 조립, report soft delete, delete rejected/success/error trash audit 기록을 담당하게 했습니다.
- `[id]/route.ts`는 `getCurrentUserReportDetailResponseData`, `deleteCurrentUserReportToTrash`, `recordCurrentUserReportDeleteRejected`만 호출하도록 줄였습니다.
- 기존 GET/DELETE public payload shape, `CONFIRM_MISMATCH`, `NO_DATA`, `softDeleted: true` 응답은 유지했습니다.
- `reports-route.test.ts`에 `[id]` route가 repository와 `auditLogStore`를 직접 import하지 않는 source-boundary 회귀 테스트를 추가했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/reports-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` 통과
- `corepack pnpm lint` 통과
- `corepack pnpm build` 통과
- `corepack pnpm planning:v2:complete` 통과
- `corepack pnpm planning:v2:regress` 통과, regression 9개와 full e2e 8개 통과

## 남은 리스크
- `planning:v2:complete`의 freeze guard는 이번 변경을 v2 core 변경으로 감지했고, 리뷰 가시성을 위해 커밋/PR 제목에 `[v2-core-change]` 태그가 필요하다고 안내했습니다.
- top-level `/api/planning/v2/reports` list/create route는 아직 reports repository를 직접 import합니다. 이번 PR은 `[id]` detail route 경계에 한정했습니다.
- GitHub Actions의 `BlobNotFound` failure 패턴은 원격 PR 생성 후 다시 확인해야 합니다.
