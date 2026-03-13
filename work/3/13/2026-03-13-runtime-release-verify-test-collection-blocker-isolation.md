# 2026-03-13 runtime release-verify test-collection blocker isolation

## 변경 파일
- `vitest.config.ts`
- `work/3/13/2026-03-13-runtime-release-verify-test-collection-blocker-isolation.md`

## 사용 skill
- `planning-gate-selector`: runtime blocker에 필요한 최소 검증 세트를 고정하는 데 사용.
- `work-log-closeout`: 이번 라운드 `/work` 마감 형식을 정리하는 데 사용.

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`이며, 이번 라운드는 planning-v3가 아니라 runtime `release:verify` 검증 blocker만 분리해서 닫았다.

## 변경 이유
- 직전 `runtime release-verify smoke`에서 `pnpm release:verify`의 첫 실패는 cleanup/build가 아니라 `gate=test`였다.
- 원인은 Vitest가 실제 테스트 소스가 아닌 generated/runtime artifact 경로까지 수집한 점이었다.
  - `.next-build/standalone/tests/e2e/flow-v3-import-to-cashflow.spec.ts`
  - `tmp/flow-v3-import-to-cashflow-audit.spec.ts`
- 이번 라운드는 첫 blocker만 닫기 위해 Vitest collection scope만 최소 범위로 조정했다.

## 핵심 변경
- `vitest.config.ts` exclude에 generated/runtime artifact 경로를 추가했다.
  - `.next-build/**`
  - `tmp/**`
- `tests/e2e/**`, `.next/**` 기존 exclude는 유지했다.
- `package.json`, `scripts/release_verify.mjs`, cleanup helper는 다시 열지 않았다.

## 검증
- `pnpm exec vitest run`
  - PASS
  - `Test Files 640 passed`
  - `Tests 1862 passed`
- `pnpm exec eslint vitest.config.ts`
  - PASS
- `pnpm release:verify`
  - PASS
  - `planning:v2:complete`, `multi-agent:guard`, `planning:v2:compat`, `planning:v2:regress`, `pnpm test`, `planning:ssot:check`까지 끝까지 통과했다.

## 남은 리스크
- 이번 라운드 기준 first blocker였던 test collection 문제는 재현되지 않았다.
- runtime 축은 현재 추가 수정 없이 닫아도 되며, 이후 `release:verify`에서 새 실패가 나오면 그때 독립 blocker로 다시 자르는 편이 안전하다.
