# 2026-04-12 style CSP tightening

## 변경 파일
- `middleware.ts`
- `scripts/security_check.mjs`
- `tests/middleware-security.test.ts`

## 사용 skill
- `work-log-closeout`: 이번 후속 라운드의 변경 파일, 실제 검증, 잔여 리스크를 `/work` 형식으로 정리

## 변경 이유
- 직전 nonce CSP 라운드 이후 app-wide `style-src 'unsafe-inline'`가 남아 있었습니다.
- 현재 앱 런타임은 inline style attribute를 일부 쓰지만 inline `<style>` 태그는 사용하지 않아, production 정책을 더 좁히는 저위험 후속 하드닝이 가능했습니다.

## 핵심 변경
- `middleware.ts` production CSP를 `style-src 'self'`, `style-src-elem 'self'`, `style-src-attr 'unsafe-inline'` 구조로 조정했습니다.
- development는 기존 `style-src 'self' 'unsafe-inline'`를 유지해 HMR과 로컬 개발 표면을 건드리지 않았습니다.
- `scripts/security_check.mjs`에 `app-runtime-no-inline-style-tag` 검사를 추가해 app runtime source에 inline `<style>`/`styled-jsx`가 다시 들어오지 않도록 막았습니다.
- `tests/middleware-security.test.ts`를 갱신해 production CSP가 `style-src-elem`/`style-src-attr` 분리 형태를 실제로 반환하는지 확인하도록 했습니다.

## 검증
- `pnpm exec eslint middleware.ts scripts/security_check.mjs tests/middleware-security.test.ts`
  - PASS
- `pnpm sec:check`
  - PASS
- `pnpm exec vitest run tests/middleware-security.test.ts`
  - PASS (1 file, 11 tests)
- `pnpm build`
  - PASS
- `node scripts/playwright_with_webserver_debug.mjs --runtime=production test tests/e2e/smoke.spec.ts --grep "production CSP routes hydrate without CSP console violations" --workers=1`
  - PASS

## 남은 리스크
- `style-src-attr 'unsafe-inline'`는 여전히 남아 있어, dynamic inline style attribute 자체는 후속 라운드에서 줄여야 합니다.
- 현재 검색 기준으로 app runtime에는 inline `<style>` 태그가 없지만, dynamic `style={{ ... }}` 사용처는 여전히 다수 남아 있습니다.
- report export HTML은 route-level CSP에서 별도로 `style-src 'unsafe-inline'`를 유지하고 있어, 이번 라운드의 tightening 범위에는 포함하지 않았습니다.
- 저장소 전체 `pnpm test` / `pnpm e2e:rc`의 기존 실패 축은 이번 라운드에서 다시 검증하지 않았습니다.
