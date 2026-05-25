# 2026-05-25 start local standalone runtime assets

## 변경 파일
- `scripts/standalone_runtime_assets.mjs`
- `scripts/start_local.mjs`
- `scripts/next_prod_safe.mjs`
- `tests/runtime/standalone-runtime-assets.test.ts`
- `docs/runtime.md`
- `work/5/25/2026-05-25-start-local-standalone-runtime-assets.md`

## 사용 skill
- `planning-gate-selector`: Next standalone launcher와 runtime asset/link 변경에 맞춰 script syntax, focused unit, build, start smoke, production smoke를 검증 범위로 정했습니다.
- `work-log-closeout`: 실제 실행한 검증과 실패 후 복구 사실을 `/work` 종료 기록으로 남기는 데 사용했습니다.

## 변경 이유
- `start_local.mjs`가 `.next/standalone/server.js`를 직접 실행할 때 `.next/static`, `public`, `prisma` runtime asset link를 보장하지 않아 `next_prod_safe.mjs`와 실행 조건이 달랐습니다.
- `/api/sources/status` smoke 중 Prisma SQLite adapter의 내부 의존성인 `@prisma/driver-adapter-utils`, `better-sqlite3`의 `bindings`, `file-uri-to-path` top-level package link 누락이 순차적으로 드러났습니다.
- standalone 산출물에는 pnpm package 원본이 trace되어 있어도 top-level 해석 링크가 없으면 production runtime에서 native binding 로딩이 실패할 수 있습니다.

## 핵심 변경
- standalone runtime asset/link 복구를 `scripts/standalone_runtime_assets.mjs` 공통 helper로 분리했습니다.
- `start_local.mjs`와 `next_prod_safe.mjs`가 standalone 실행 전에 같은 helper를 호출하도록 맞췄습니다.
- helper가 `.next/static`, `public`, `prisma`뿐 아니라 `@prisma/driver-adapter-utils`, `bindings`, `file-uri-to-path` package link도 복구하도록 했습니다.
- runtime 단위 테스트가 static/public/prisma link와 Prisma/better-sqlite 관련 package link를 함께 검증하도록 확장했습니다.
- `docs/runtime.md`에 standalone launcher가 복구하는 runtime asset/package link 범위를 기록했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node scripts/worktree_scope.mjs scripts/standalone_runtime_assets.mjs scripts/start_local.mjs scripts/next_prod_safe.mjs tests/runtime/standalone-runtime-assets.test.ts docs/runtime.md` 실행: total 209 / in-scope 5 / out-of-scope 204
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- scripts/start_local.mjs scripts/next_prod_safe.mjs scripts/standalone_runtime_assets.mjs tests/runtime/standalone-runtime-assets.test.ts docs/runtime.md` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/start_local.mjs scripts/next_prod_safe.mjs scripts/standalone_runtime_assets.mjs tests/runtime/standalone-runtime-assets.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node --check scripts/start_local.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node --check scripts/next_prod_safe.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node --check scripts/standalone_runtime_assets.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/runtime/standalone-runtime-assets.test.ts tests/runtime/start-local-lock.test.ts tests/runtime/start-local-port.test.ts` 통과: 3 files / 8 tests
- helper 직접 호출 후 standalone 기준 `@prisma/adapter-better-sqlite3` require와 adapter 생성 확인: `adapter-ok`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과
- `start_local.mjs --no-open-existing --port 3211` smoke 통과: 링크 제거 상태에서 복구 로그 확인, `/`, `/_next/static/<BUILD_ID>/_buildManifest.js`, `/api/sources/status` 200 확인, `START_LOCAL_SMOKE_OK sources=3`
- `next_prod_safe.mjs --port 3212` smoke 통과: package link 제거 상태에서 복구 로그 확인, `/`, `/api/sources/status` 200 확인, `PROD_SAFE_SMOKE_OK sources=3`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 node scripts/playwright_with_webserver_debug.mjs --runtime=production --port=3201 test tests/e2e/smoke.spec.ts --grep "production CSP routes hydrate without CSP console violations" --workers=1 --reporter=line` 통과: 1 passed
- `pgrep -af 'scripts/start_local.mjs|scripts/next_prod_safe.mjs|standalone/server.js|next-server|node -'` 최종 확인: 남은 runtime process 없음

## 남은 리스크
- 검증 중 symlink 제거 smoke의 한 변형이 symlink 자체가 아니라 symlink 대상 디렉터리를 지워 `.next/standalone` 산출물을 손상시켰습니다. `pnpm build`로 재생성했고 이후 start/prod smoke는 symlink를 `unlink`하는 방식으로 통과했습니다.
- 전체 worktree에는 범위 밖 변경 204개가 남아 있어 이 runtime launcher 변경만 stage하려면 범위 내 5개 파일과 이 `/work` 기록만 선별해야 합니다.
- 전체 `pnpm test`와 `pnpm e2e:rc`는 실행하지 않았습니다. 이번 변경은 launcher/helper 중심이라 focused unit, build, start/prod smoke, production CSP smoke로 한정했습니다.

## 다음 라운드
- `dev-security-runtime` 후보를 이어서 점검합니다.
- production 비노출이어야 하는 `/api/dev/*`, debug 화면, middleware guard, security scan 기준을 실제 route 목록과 대조합니다.
- 최종 판단은 `pnpm build`와 필요한 dev/security focused guard를 메인 에이전트가 단독으로 실행해 남깁니다.
