# 2026-04-12 보안 하드닝 2차 마감

## 변경 파일
- `middleware.ts`
- `src/lib/dev/devGuards.ts`
- `scripts/security_route_guard_scan.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `src/app/api/dev/benefits/coverage/route.ts`
- `src/app/api/dev/artifacts/route.ts`
- `src/app/api/dev/audit/recent/route.ts`
- `src/app/api/dev/backup/export/route.ts`
- `src/app/api/dev/backup/import/route.ts`
- `src/app/api/dev/backup/restore-point/route.ts`
- `src/app/api/dev/backup/restore-point/rollback/route.ts`
- `src/app/api/dev/benefits/export/route.ts`
- `src/app/api/dev/benefits/probe/route.ts`
- `src/app/api/dev/benefits/snapshot/refresh/route.ts`
- `src/app/api/dev/daily-refresh/status/route.ts`
- `src/app/api/dev/dart/alerts/route.ts`
- `src/app/api/dev/dart/brief/route.ts`
- `src/app/api/dev/data-sources/health/route.ts`
- `src/app/api/dev/data-sources/ping/route.ts`
- `src/app/api/dev/doctor/fix/history/route.ts`
- `src/app/api/dev/doctor/summary/route.ts`
- `src/app/api/dev/errors/recent/route.ts`
- `src/app/api/dev/finlife/schema-report/route.ts`
- `src/app/api/dev/git/route.ts`
- `src/app/api/dev/news/brief/route.ts`
- `src/app/api/dev/public-apis/sample/route.ts`
- `src/app/api/dev/public-apis/status/route.ts`
- `tests/dev-guards.test.ts`
- `tests/middleware-security.test.ts`
- `tests/artifacts-route.test.ts`
- `tests/dev-unlock-auth.test.ts`

## 사용 skill
- `work-log-closeout`: 실제 변경 파일, 실제 검증 결과, 잔여 리스크를 `/work` 형식에 맞춰 정리

## 변경 이유
- `/api/dev/**` read/mutation route에 route 내부 공통 가드가 일관되지 않아, dev 환경에서 local-only 규칙이 누락되거나 코드 리뷰 비용이 큰 상태였습니다.
- production CSP의 `connect-src`가 dev와 동일하게 넓어 보안 여지를 줄일 필요가 있었습니다.
- `pnpm audit --json` 기준 `eslint`/`vitest`/`prisma` 체인과 `yauzl`에 걸린 advisory를 정리해야 했습니다.

## 핵심 변경
- `middleware.ts`에서 CSP `connect-src`를 환경별로 분리해 production은 `'self' https: wss:`만 허용하도록 좁혔습니다.
- `src/lib/dev/devGuards.ts`에 `guardDevReadRequest`, `guardDevMutationRequest`를 추가해 `onlyDev + local-only + same-origin + optional CSRF`를 공통화했습니다.
- `/api/dev/**` 중 기존 `onlyDev()` 또는 직접 `NODE_ENV` 판별만 하던 route를 공통 helper 기준으로 정규화했고, 기존 `404/403` payload shape가 필요한 곳은 `onBlocked`/`onError`로 유지했습니다.
- `scripts/security_route_guard_scan.mjs`와 `pnpm sec:scan:routes`를 추가해 `/api/dev/**`, `/api/ops/**`, public mutation route, `src/app/ops/**/actions.ts`의 가드 계약을 정적 검사로 고정했습니다.
- dependency/toolchain은 `eslint@9.39.4`, `vitest@4.1.4`, `prisma/@prisma/client/@prisma/adapter-better-sqlite3@7.7.0`으로 올리고, `vite@7.3.2`, `yauzl@3.2.1`, `pnpm.overrides["@hono/node-server"]=1.19.13`을 추가해 최종 `pnpm audit --json` 0건으로 마감했습니다.
- `standaloneHtmlReport` inline print script와 `pdfReport`의 `new Function(import)` loader는 이번 라운드에서 의도적으로 건드리지 않았습니다.

## 검증
- `pnpm sec:scan:routes`
  - PASS
- `pnpm exec vitest run tests/dev-guards.test.ts tests/artifacts-route.test.ts tests/dev-unlock-auth.test.ts tests/middleware-security.test.ts`
  - PASS (4 files, 30 tests)
- `pnpm sec:check`
  - PASS
- `pnpm exec vitest run tests/middleware-security.test.ts tests/dev-guards.test.ts tests/trusted-origin.test.ts tests/recovery-reset.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-journal-api.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/artifacts-route.test.ts tests/dev-unlock-auth.test.ts`
  - PASS (9 files, 55 tests)
- `pnpm planning:current-screens:guard`
  - PASS (5 files, 9 tests)
- `pnpm up eslint@9.39.4 vitest@4.1.4 prisma@7.7.0 @prisma/client@7.7.0 @prisma/adapter-better-sqlite3@7.7.0`
  - PASS
- `pnpm why vite`
  - `vitest` peer 기준 `vite 7.3.1` 확인
- `pnpm add -D vite@7.3.2`
  - PASS
- `pnpm add -D yauzl@3.2.1`
  - PASS
- `pnpm install`
  - PASS (`@hono/node-server` override 반영, `prisma generate` 완료)
- `pnpm audit --json`
  - 최초 재확인: `moderate 1`, `high 0`, `critical 0`
  - 최종 재확인: `info 0 / low 0 / moderate 0 / high 0 / critical 0`
- `pnpm lint`
  - 최초 1 warning: `scripts/security_route_guard_scan.mjs`의 미사용 상수
  - 미사용 상수 제거 후 재실행 PASS
- `pnpm test`
  - FAIL
  - 보안 변경과 직접 무관한 기존/동시 worktree 이슈로 보이는 실패 10건:
    - `tests/daily-brief-route.test.ts`
    - `tests/disclosure-alerts-route.test.ts`
    - `tests/news-brief-route.test.ts`
    - `tests/news-search-index.test.ts`
    - `tests/planning-v3-news-alerts-api.test.ts`
    - `tests/planning-v3-news-search-api.test.ts`
- `pnpm build`
  - PASS
- `pnpm e2e:rc`
  - FAIL (7 passed / 15 failed)
  - 실패 군:
    - `tests/e2e/dart-flow.spec.ts`
    - `tests/e2e/data-sources-settings.spec.ts`
    - `tests/e2e/flow-history-to-report.spec.ts`
    - `tests/e2e/news-settings-alert-rules.spec.ts`
    - `tests/e2e/planning-quickstart-preview.spec.ts`

## 남은 리스크
- 보안 전용 게이트와 `audit`는 모두 정리됐지만, 저장소 전체 `pnpm test`와 `pnpm e2e:rc`는 이번 라운드 범위 밖인 news/planning follow-through 회귀로 계속 실패합니다.
- `middleware.ts`, `package.json`, `pnpm-lock.yaml`에는 이번 라운드 전부터 unrelated dirty 변경이 섞여 있습니다. 이번 보안 라운드에서는 그 위에 좁게 작업했고, 기존 변경은 되돌리지 않았습니다.
- `script-src 'unsafe-inline'` 제거와 app-wide nonce CSP 전환은 아직 미완료입니다.
- `standaloneHtmlReport` inline print script, `pdfReport` loader는 추적 이슈로 남겨 두었고 이번 라운드에서는 동작 불변을 우선했습니다.
