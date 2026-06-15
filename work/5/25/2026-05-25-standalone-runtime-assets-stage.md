# 2026-05-25 standalone runtime assets stage

## 변경 파일
- `next.config.ts`
- `scripts/next_prod_safe.mjs`
- `scripts/start_local.mjs`
- `scripts/standalone_runtime_assets.mjs`
- `tests/runtime/standalone-runtime-assets.test.ts`
- `docs/runtime.md`
- `work/5/25/2026-05-25-standalone-runtime-assets-stage.md`

## 사용 skill
- `planning-gate-selector`: Next standalone 설정, prod/start launcher, runtime asset helper 변경에 맞춰 unit, lint, build, production smoke를 선택했습니다.
- `work-log-closeout`: 실제 scope, 실행 검증, 실패 후 재시도, 남은 후보 리스크를 기록했습니다.

## 변경 이유
- standalone server 실행 시 `.next/static`, `public`, `prisma`와 Prisma/better-sqlite 관련 package link가 없으면 production runtime에서 asset 또는 native binding 로딩이 실패할 수 있습니다.
- `next_prod_safe.mjs`와 `start_local.mjs`가 같은 runtime asset 복구 helper를 쓰도록 맞춰 실행 경로 차이를 줄여야 합니다.
- `next.config.ts`에는 standalone trace에 필요한 Prisma/SQLite package 포함만 남기고, 특정 WSL LAN IP 하드코딩은 제거했습니다.

## 핵심 변경
- standalone runtime asset/link 복구를 `scripts/standalone_runtime_assets.mjs`로 분리했습니다.
- `next_prod_safe.mjs`와 `start_local.mjs`가 standalone 실행 전에 `ensureStandaloneRuntimeAssets`를 호출하도록 했습니다.
- helper는 `.next/static`, `public`, `prisma`와 `@prisma/driver-adapter-utils`, `bindings`, `file-uri-to-path` 링크를 복구합니다.
- `next.config.ts`는 Prisma SQLite adapter와 `better-sqlite3` trace include를 보강하되 환경 고정 LAN IP는 넣지 않습니다.
- `docs/runtime.md`와 단위 테스트에 standalone runtime asset/link 복구 범위를 기록했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/worktree_scope.mjs next.config.ts scripts/next_prod_safe.mjs scripts/start_local.mjs scripts/standalone_runtime_assets.mjs tests/runtime/standalone-runtime-assets.test.ts docs/runtime.md` 통과: 전체 218, 범위 내 6, 범위 밖 212
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- next.config.ts scripts/next_prod_safe.mjs scripts/start_local.mjs scripts/standalone_runtime_assets.mjs tests/runtime/standalone-runtime-assets.test.ts docs/runtime.md` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh -lc 'node --check scripts/next_prod_safe.mjs && node --check scripts/start_local.mjs && node --check scripts/standalone_runtime_assets.mjs'` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/runtime/standalone-runtime-assets.test.ts tests/runtime/start-local-lock.test.ts tests/runtime/start-local-port.test.ts` 통과: 3 files, 8 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint next.config.ts scripts/next_prod_safe.mjs scripts/start_local.mjs scripts/standalone_runtime_assets.mjs tests/runtime/standalone-runtime-assets.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과: 254 static pages 생성
- PowerShell here-string으로 `next_prod_safe.mjs --port 3222` production smoke 실행 통과: `/` 69424 bytes, `/api/sources/status` 698 bytes, Prisma/better-sqlite/runtime asset link 로그 확인
- 첫 `start_local` Node smoke는 `require()`와 top-level await 혼합으로 실패했습니다. 같은 smoke를 ESM import 형식으로 재실행해 통과했습니다.
- ESM Node smoke로 `start_local.mjs --no-open-existing --port 3223` 실행 통과: `/` 65711 bytes, `/api/sources/status` 616 bytes
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh -lc "pgrep -af 'scripts/start_local.mjs|scripts/next_prod_safe.mjs|standalone/server.js|next-server|3222|3223' || true"` 실행: 검색 명령 외 남은 runtime process 없음

## 남은 리스크
- 이 후보 7개 파일은 현재 staged 상태이며, staged diff check와 multi-agent 가드를 통과했습니다.
- `public/planning-report-print.js`, report export CSP 변경, production dev/debug hidden smoke는 이번 standalone 후보 밖이며 별도 report/CSP/security 후보로 분리해야 합니다.
- 전체 dirty worktree에는 아직 212개 안팎의 범위 밖 변경이 남아 있어 전체 stage는 계속 위험합니다.

## 다음 라운드
- 이 7개 파일을 독립 커밋으로 분리한 뒤 stage를 다시 비웁니다.
- 다음 후보는 report export CSP 또는 dev-security runtime 중 범위와 검증 근거가 더 명확한 묶음부터 확인합니다.
