# 2026-04-12 app-wide nonce CSP 마감

## 변경 파일
- `middleware.ts`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/fonts/PretendardVariable.woff2`
- `src/lib/dev/localRequest.ts`
- `src/lib/sources/datago/kdb.ts`
- `scripts/datago_sync.mjs`
- `scripts/security_check.mjs`
- `tests/middleware-security.test.ts`
- `tests/dev-local-request.test.ts`
- `tests/datago-servicekey.test.ts`
- `tests/e2e/smoke.spec.ts`

## 사용 skill
- `work-log-closeout`: 실제 변경, 실제 검증, 잔여 리스크를 `/work` 형식으로 정리

## 변경 이유
- production app-wide `script-src 'unsafe-inline'` 제거와 nonce 기반 CSP 전환을 실제 코드 기준으로 마감해야 했습니다.
- 루트 layout의 외부 jsDelivr 폰트 링크가 strict CSP와 충돌하고 있어 self-host로 같이 정리할 필요가 있었습니다.
- 남아 있던 보안성 이슈인 KDB 평문 HTTP 업스트림과 production `ALLOW_REMOTE` 우회도 이번 라운드에서 함께 닫는 것이 맞았습니다.

## 핵심 변경
- `middleware.ts`를 nonce 분기형으로 바꿔 non-API document 요청에 per-request nonce를 주입하고, production `script-src`에서 `unsafe-inline`/`unsafe-eval`을 제거했습니다.
- 루트 `layout.tsx`는 `await connection()`으로 request-time rendering에 고정하고, `next/font/local` + vendored `PretendardVariable.woff2`로 외부 폰트 링크를 제거했습니다.
- `src/lib/dev/localRequest.ts`에서 `ALLOW_REMOTE` override를 production에서는 무시하도록 고정했습니다.
- KDB data.go.kr endpoint를 runtime fetcher와 sync script 모두 `https://apis.data.go.kr/...`로 통일했습니다.
- `scripts/security_check.mjs`에 jsDelivr 루트 폰트 링크와 insecure KDB endpoint 재발 방지 스캔을 추가했습니다.
- middleware/unit/e2e smoke 검증을 보강해 production CSP nonce, production `ALLOW_REMOTE` 차단, KDB HTTPS, CSP console violation 부재를 확인하도록 했습니다.

## 검증
- `pnpm exec eslint middleware.ts src/app/layout.tsx src/app/globals.css src/lib/dev/localRequest.ts src/lib/sources/datago/kdb.ts scripts/datago_sync.mjs scripts/security_check.mjs tests/middleware-security.test.ts tests/dev-local-request.test.ts tests/datago-servicekey.test.ts tests/e2e/smoke.spec.ts`
  - exit 0
  - `src/app/globals.css` ignored warning 1건
- `pnpm exec vitest run tests/middleware-security.test.ts tests/dev-local-request.test.ts tests/debug-access.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/datago-servicekey.test.ts`
  - PASS (5 files, 30 tests)
- `pnpm sec:check`
  - PASS
- `pnpm sec:scan:routes`
  - PASS
- `pnpm lint`
  - PASS
- `pnpm build`
  - PASS
- `node scripts/playwright_with_webserver_debug.mjs --runtime=production test tests/e2e/smoke.spec.ts --grep "production CSP routes hydrate without CSP console violations" --workers=1`
  - PASS
- `pnpm e2e:rc`
  - FAIL
  - 기존 실패 축 확인: `dart-flow`, `data-sources-settings`, `flow-history-to-report`, `news-settings-alert-rules`, `planning-quickstart-preview`
  - 이번 라운드에서 추가한 `tests/e2e/smoke.spec.ts`의 CSP console violation smoke는 same run 안에서 PASS
- `pnpm test`
  - FAIL
  - 기존 실패 축 확인: `daily-brief-route`, `disclosure-alerts-route`, `news-brief-route`, `news-search-index`, `planning-v3-news-alerts-api`, `planning-v3-news-search-api`
- `git diff --check -- middleware.ts src/app/layout.tsx src/app/globals.css src/app/fonts/PretendardVariable.woff2 src/lib/dev/localRequest.ts src/lib/sources/datago/kdb.ts scripts/datago_sync.mjs scripts/security_check.mjs tests/middleware-security.test.ts tests/dev-local-request.test.ts tests/datago-servicekey.test.ts tests/e2e/smoke.spec.ts`
  - PASS

## 남은 리스크
- `await connection()` 적용으로 app routes가 request-time rendering으로 고정되었습니다. 이번 배치에서는 수용했지만, 캐시/성능 영향은 후속 운영 점검이 필요합니다.
- `style-src 'unsafe-inline'`는 이번 라운드 범위 밖이라 그대로 남아 있습니다. inline style/hash/nonce 전환은 후속 배치로 분리해야 합니다.
- `pnpm e2e:rc`와 `pnpm test`는 이번 보안 변경과 별개인 기존 뉴스/DART/planning handoff 계열 실패가 남아 있어 저장소 전체 green 상태는 아직 아닙니다.
- unrelated dirty worktree가 계속 남아 있으므로, 다음 라운드도 이번처럼 보안 변경 파일만 좁게 잡아야 합니다.
