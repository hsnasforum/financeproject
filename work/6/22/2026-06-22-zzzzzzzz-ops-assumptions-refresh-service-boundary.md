# 2026-06-22 Ops Assumptions Refresh Service Boundary

## 변경 파일
- `src/app/api/ops/assumptions/refresh/route.ts`
- `src/lib/ops/assumptions/assumptionsRefreshRouteService.ts`
- `src/lib/planning/privacy/redact.ts`
- `tests/planning/ops/assumptions-refresh-route.test.ts`
- `tests/planning/ops/ops-assumptions-refresh-route-service-boundary.test.ts`
- `tests/planning/privacy/redact.test.ts`
- `work/6/22/2026-06-22-zzzzzzzz-ops-assumptions-refresh-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준 다음 후보와 Finance Project skill 조합 확인
- `planning-gate-selector`: ops API route, auth/user scope, build 영향에 맞춘 검증 세트 선정
- `dart-data-source-hardening`: assumptions refresh의 외부 데이터/freshness/fallback 경계와 오류 노출 점검
- `work-log-closeout`: 종료 기록 섹션과 실제 실행 명령 기록 기준 확인
- AGENTS.md의 manager-first/Spark 조건부 지침에 따라 manager 분해 후 Spark explorer(`gpt-5.3-codex-spark`, `xhigh`)로 route forbidden pattern과 public contract를 정적 확인

## 변경 이유
- `/api/ops/assumptions/refresh` route가 `buildAssumptionsSnapshot`, audit log, ops audit, metrics store, redaction을 직접 호출하고 있었습니다.
- refresh는 BOK/ECOS/KOSTAT fallback과 freshness warning을 간접적으로 다루므로 route는 guard/auth/응답 매핑만 담당하고, 부수효과는 service 경계 뒤에 두는 편이 안전합니다.
- 기존 route에는 `requirePlanningRouteUser`가 없어 운영 액션 결과에 current-user meta가 일관되게 붙지 않았습니다.

## 핵심 변경
- `assumptionsRefreshRouteService`를 추가해 snapshot refresh, audit log, ops audit, metrics 기록, 실패 메시지 redaction을 route 밖으로 이동했습니다.
- refresh route는 `onlyDev`, local/same-origin/dev unlock/CSRF guard, `requirePlanningRouteUser`, service 결과의 HTTP 응답 매핑만 담당하게 정리했습니다.
- 성공 응답의 기존 `ok/latestId/message/snapshot` shape는 유지하고, `meta.userId/authSource`를 추가했습니다.
- `PLANNING_AUTH_REQUIRED=1`에서 인증 신호 없는 refresh 요청은 snapshot 생성 전에 `401 UNAUTHENTICATED`로 차단됩니다.
- `process.env.SECRET_TOKEN=...` 형태의 실패 메시지가 공개 오류, audit, ops contract로 흘러가지 않도록 공용 `redactText`를 보강했습니다.
- route가 audit store, ops audit/metric store, assumptions sync, privacy redaction에 직접 접근하지 못하게 boundary 테스트를 추가했습니다.

## 검증
- PASS: `corepack pnpm vitest run tests/planning/ops/assumptions-refresh-route.test.ts tests/planning/ops/ops-assumptions-refresh-route-service-boundary.test.ts tests/planning-security-csrf.test.ts tests/planning/privacy/redact.test.ts`
- PASS: `corepack pnpm vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/middleware-security.test.ts tests/planning/ops/actions-run-route.test.ts tests/planning/ops/support-export-route.test.ts tests/planning-assumptions-ops-route.test.ts`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:ssot:check`
- PASS: `corepack pnpm test` (715 files, 2,288 tests)
- PASS: `corepack pnpm verify` (715 files, 2,288 tests)
- 정리: `pnpm verify`가 생성한 `docs/schema-drift-report.md`, `docs/data-freshness-report.md`, `docs/dart-rules-quality-report.md`는 이번 PR 범위가 아니어서 원상 복구했습니다.

## 남은 리스크
- UI/e2e는 실행하지 않았습니다. `/ops/assumptions` 버튼의 API 응답 shape는 기존 필드를 유지하고 `meta`만 추가했습니다.
- `ops/assumptions/latest`, `sync`, `history` 계열 route는 이번 라운드 범위 밖입니다. 일부 route에는 아직 직접 storage/sync 접근이 남아 있습니다.
- `pnpm verify` 기준 freshness snapshot 8개는 여전히 stale입니다. 이번 변경은 refresh route 경계 정리이며 live refresh 증거 생성은 별도 라운드 대상입니다.

## 다음 라운드
- 우선 후보: `src/app/api/ops/assumptions/sync/route.ts` 또는 `src/app/api/ops/assumptions/latest/route.ts`의 직접 storage/sync 접근을 service 계층으로 분리하고, current-user scope를 표준화합니다.
