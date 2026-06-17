# 2026-06-17 Auth/User Scope Baseline PR

## 요약
- PR 분리 워크트리: `/home/xpdlqj/code/finance-pr-auth-user-scope-baseline`
- 브랜치: `codex/auth-user-scope-baseline`
- 원본 dirty 워크트리(`/home/xpdlqj/code/finance`)는 수정하지 않았습니다.
- Planning v2/v3, reports, runs, ops, backup/security 경로에 현재 사용자 범위 확인과 서버 페이지 초기 로딩 경로를 보강했습니다.
- 로컬 e2e에서는 명시적 trusted planning user header를 사용하도록 설정하고, 외부 baseURL에서는 기본 활성화되지 않게 유지했습니다.

## 사용 skill
- `work-artifact-intake`: 기존 `/work` 흐름과 최근 검증 맥락 확인
- `planning-gate-selector`: route/page/auth 변경에 필요한 검증 세트 선정
- `route-ssot-check`: 사용자 경로와 `docs/current-screens.md` 변경 검토
- `verification-failure-followthrough`: build/e2e 실패 원인 축소, 수정, 재검증
- `work-log-closeout`: 이번 라운드 종료 기록 작성

## 변경 범위
- Auth/current user: NextAuth/local/trusted-header 기반 current planning user 확인 경로와 테스트를 추가했습니다.
- API routes: planning v2/v3, report/run/share/trash, ops planning cache/backup/security/metrics 경로에 사용자 범위 메타와 접근 검증을 보강했습니다.
- Server pages: planning reports/runs/v3 pages에서 서버 측 초기 데이터 로드가 현재 사용자 범위 안에서만 동작하도록 보강했습니다.
- v3 service repositories: 기존 store 호출 앞단에 route user 범위 검증을 적용하는 repository/helper 계층을 추가했습니다.
- Test/automation: auth coverage, route/user-scope coverage, SQLite backfill script, local e2e auth bridge를 추가했습니다.
- Docs/config: `.env.example`, `docs/current-screens.md`, `package.json`, `playwright.config.ts`, `vitest.config.ts`를 범위에 맞게 갱신했습니다.

## 검증
- PASS: `git diff --check`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm planning:auth:check` (12 files, 106 tests)
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm planning:ssot:check` (5 files, 9 tests)
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm planning:user-scope:check` (11 files, 23 tests)
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm lint`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm test` (684 files, 2176 tests)
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts tests/e2e/planning-quickstart-preview.spec.ts --workers=1` (13 passed)
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm e2e:rc` (24 passed, 1 skipped)

## 실패 후 조치 이력
- build: `onlyDev({ allowPackagedRuntime: true })`, 지원하지 않는 `detectTransfers`, 존재하지 않는 초기 props로 인한 실패를 제거했습니다.
- e2e: local document/RSC 요청이 current user를 못 받아 401이 나던 문제를 `pageAuth` trusted-header bridge와 Playwright header 설정으로 보정했습니다.
- e2e: 상담/실행 문구 전환으로 깨진 기대값을 현재 사용자 문구와 이전 문구를 모두 허용하도록 좁게 수정했습니다.

## 남은 리스크
- 원본 워크트리에는 사용자의 대규모 dirty 변경이 남아 있으며 이번 PR 분리 작업에서는 건드리지 않았습니다.
- 직접 `corepack pnpm exec tsc --noEmit --pretty false` 실행 시 `tests/playwright-install-chromium.test.ts`의 기존 `ProcessEnv` 타입 이슈가 남아 있습니다. 필수 PR 게이트인 `pnpm build`는 통과했습니다.
- 로컬 e2e trusted-header 기본값은 local baseURL에서만 쓰도록 제한했습니다. 외부 환경에서는 명시 설정 없이는 활성화되지 않습니다.
