# 2026-05-25 production standalone data source hardening

## 변경 파일
- `next.config.ts`
- `scripts/next_prod_safe.mjs`
- `src/lib/sources/status.ts`
- `tests/sources-status.test.ts`
- `work/5/25/2026-05-25-production-standalone-data-source-hardening.md`

## 사용 skill
- `planning-gate-selector`: config/runtime/API 변경에 맞춰 build와 production smoke를 포함하는 검증 범위를 정하는 데 사용했습니다.
- `dart-data-source-hardening`: 데이터 소스 저장소 미초기화, DB 경로 누락, 부분 실패 시 전체 UI/API가 무너지지 않도록 fallback을 설계하는 데 사용했습니다.
- `work-log-closeout`: production standalone 오류 진행과 최종 검증 결과를 `/work`에 기록했습니다.

## 변경 이유
- production standalone smoke 중 `/api/sources/status`에서 `@prisma/client`의 `better_sqlite3.node` 바인딩 누락이 서버 로그로 노출됐습니다.
- 바인딩 포함 후에는 standalone 실행 위치 기준 `prisma` 디렉터리 누락, 이후 빈 `prisma/dev.db`의 테이블 미초기화가 순차적으로 드러났습니다.
- 데이터 소스 상태 API는 일부 저장소가 준비되지 않아도 Finlife 상태와 안전한 DATAGO 오류 행을 반환해야 합니다.

## 핵심 변경
- `next.config.ts`에 Prisma SQLite adapter, Prisma client, `better-sqlite3`를 server external package로 지정하고 standalone tracing include를 보강했습니다.
- `next_prod_safe`가 standalone 실행 전에 루트 `prisma` 디렉터리를 `.next/standalone/prisma`에 연결하도록 했습니다.
- `/api/sources/status`의 DATAGO 상태 조회 전 `sqlite_master`로 필요한 테이블 존재를 확인하고, 미초기화 상태는 `lastError`가 있는 stale row로 낮췄습니다.
- DATAGO 저장소 미초기화 fallback 단위 테스트를 추가했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node scripts/worktree_scope.mjs next.config.ts scripts/next_prod_safe.mjs src/lib/sources/status.ts tests/sources-status.test.ts` 실행: total 204 / in-scope 4 / out-of-scope 200
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- next.config.ts scripts/next_prod_safe.mjs src/lib/sources/status.ts tests/sources-status.test.ts` 통과
- Node trailing whitespace check 실행: `next.config.ts`, `scripts/next_prod_safe.mjs`, `src/lib/sources/status.ts`, `tests/sources-status.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint next.config.ts scripts/next_prod_safe.mjs src/lib/sources/status.ts tests/sources-status.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/sources-status.test.ts` 통과: 1 file / 1 test
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 최초 실행은 244초 제한으로 결과 미확정, 같은 명령을 420초 제한으로 재실행해 통과
- build 후 trace 확인: `.next/standalone/node_modules/@prisma/adapter-better-sqlite3`, `.next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node` 포함 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 node scripts/playwright_with_webserver_debug.mjs --runtime=production --port=3201 test tests/e2e/smoke.spec.ts --grep "production CSP routes hydrate without CSP console violations" --workers=1 --reporter=line` 최종 통과: 1 passed, `prisma:error`와 `[sources/status] failed` 로그 없음

## 실패 모드 점검 결과
- adapter/native binding 누락: standalone trace include와 external package 지정으로 해결했습니다.
- standalone cwd 변경으로 인한 `./prisma/dev.db` 디렉터리 누락: `next_prod_safe`의 runtime symlink로 해결했습니다.
- 빈 DB 또는 스키마 미초기화: DATAGO row를 `isFresh=false`, `counts=0`, `lastError` 안내로 반환해 전체 API 실패를 막았습니다.

## 남은 리스크
- `prisma/dev.db`가 0 bytes인 현재 로컬 상태에서는 DATAGO 공공데이터가 실제로는 동기화되지 않은 stale/error 상태로 표시됩니다. 실제 데이터 사용 전에는 `pnpm prisma db push`와 필요한 sync가 별도 작업으로 필요합니다.
- `next.config.ts` tracing include가 pnpm store의 여러 `better-sqlite3` 버전을 포함해 standalone 크기가 늘 수 있습니다. stage 전 크기 영향은 별도 확인 대상입니다.
- 전체 worktree에는 범위 밖 변경 200개가 남아 있어 이 runtime hardening만 단독 stage하려면 config/runtime 후보 의존성을 다시 확인해야 합니다.

## 다음 라운드
- `dev-security-runtime` 후보에서 middleware, security scan, dev route guard 변경을 focused gate로 검증합니다.
- `start_local.mjs`도 standalone 직접 실행 경로를 쓰므로, `next_prod_safe`와 같은 runtime asset link가 필요한지 후속 점검합니다.
