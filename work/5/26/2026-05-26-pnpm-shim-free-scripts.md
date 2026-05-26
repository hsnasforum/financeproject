# 2026-05-26 pnpm shim 없는 검증 스크립트 실행성 보강

## 변경 파일
- `package.json`
- `scripts/playwright_with_webserver_debug.mjs`
- `docs/dart-rules-eval-report.md`
- `docs/dart-rules-quality-report.md`
- `docs/data-freshness-report.md`
- `docs/schema-drift-report.md`
- `work/5/26/2026-05-26-pnpm-shim-free-scripts.md`

## 사용 skill
- `planning-gate-selector`: verification script와 Next build/prod e2e wrapper 영향에 맞춰 `typecheck`, 단일 테스트, `verify`, prod e2e, lint를 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 실패 재현, 수정, 검증, 남은 미실행 스크립트를 `/work` 형식으로 남기기 위해 사용했습니다.

## 변경 이유
- 직전 라운드에서 `planning:current-screens:guard`의 nested `pnpm` 호출을 고쳤지만, `package.json`에 같은 패턴이 더 남아 있었습니다.
- 현재 로컬 환경은 `corepack pnpm`은 동작하지만 bare `pnpm` shim은 없어서 `corepack pnpm typecheck`, `corepack pnpm planning:v2:report:test`가 각각 `sh: 1: pnpm: not found`로 실패했습니다.
- prod e2e 조합은 package script를 직접 명령으로 바꾼 뒤에도 Playwright wrapper 내부의 `spawn pnpm` 때문에 실패해 wrapper fallback까지 필요했습니다.

## 핵심 변경
- `package.json`의 nested `pnpm ...` 호출을 `tsc`, `vitest run`, `node ...`, `eslint ...` 직접 실행으로 바꿨습니다.
- `scripts/playwright_with_webserver_debug.mjs`가 `pnpm`을 찾지 못하면 `corepack pnpm`으로 Playwright 실행을 재시도하도록 했습니다.
- fallback 시작 뒤 첫 child의 `close` 이벤트가 먼저 종료 처리하지 않도록 보호했습니다.
- `verify`, `data:doctor`, `dart:rules:eval:all` 실행으로 생성된 DART/schema/freshness 보고서 기준 시각을 갱신했습니다.

## 검증
- `corepack pnpm typecheck` FAIL(수정 전): 내부 `pnpm exec tsc --noEmit`에서 `sh: 1: pnpm: not found`
- `corepack pnpm planning:v2:report:test` FAIL(수정 전): 내부 `pnpm test ...`에서 `sh: 1: pnpm: not found`
- `corepack pnpm typecheck` PASS
- `corepack pnpm typecheck:planning` PASS
- `corepack pnpm planning:v2:report:test` PASS: 1 file, 3 tests
- `corepack pnpm planning:v2:guide:test` PASS: 1 file, 8 tests
- `corepack pnpm verify` PASS: `validate:dumps`, schema/freshness, DART rules gate, security checks, lint, typecheck, `vitest run` 661 files / 2029 tests
- `corepack pnpm data:doctor` PASS: schema snapshots 10, freshness total 8 fresh 8
- `corepack pnpm dart:rules:eval:all` PASS: corpus 89, unknownRate 9.0%
- `corepack pnpm e2e:parallel:flake:prod` FAIL(수정 중): build는 성공했지만 wrapper 내부 `spawn pnpm ENOENT`
- `node --check scripts/playwright_with_webserver_debug.mjs` PASS
- `node scripts/playwright_with_webserver_debug.mjs --version` PASS: Playwright `1.58.2`
- `corepack pnpm e2e:parallel:flake:prod:raw` PASS: 14 passed
- `corepack pnpm e2e:parallel:flake:prod` PASS: build + 14 passed
- `corepack pnpm lint` PASS
- `git diff --check` PASS
- `package.json` script 값에서 `\bpnpm\b` 검색 결과 없음

## 남은 리스크
- `seed:kdb`, `products:sync`, `e2e:parallel:report-flake:prod`는 이번 라운드에서 직접 실행하지 않았습니다. 다만 남은 bare `pnpm` 호출은 없고, 같은 wrapper fallback은 `e2e:parallel:flake:prod`로 검증했습니다.
- 이번 커밋을 push하면 PR #24 head SHA가 다시 바뀌므로 GitHub Actions `CI`, `E2E Smoke`를 새 SHA 기준으로 다시 확인해야 합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 미실행 항목 중 fixture 기반인 `seed:kdb`를 먼저 확인하고, 외부 동기화 성격의 `products:sync`는 별도 승인 또는 안전한 fixture 경로가 있을 때 실행합니다.
- PR #24 head가 바뀌면 GitHub Actions `CI`, `E2E Smoke`를 다시 확인합니다.
- wrapper fallback을 쓰는 다른 e2e 스크립트는 실패 재현이 있을 때 같은 방식으로 좁게 보강합니다.
