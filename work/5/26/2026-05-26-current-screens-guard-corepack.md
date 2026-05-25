# 2026-05-26 current-screens guard corepack 실행성 보강

## 변경 파일
- `package.json`
- `work/5/26/2026-05-26-current-screens-guard-corepack.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: planning v3 transaction override owner surface와 legacy/internal bridge 경계를 좁게 감사하기 위해 사용했습니다.
- `route-ssot-check`: `/planning/v3/transactions*`, `/planning/v3/batches*`, `docs/current-screens.md`의 실제 route/문서 기준 일치를 확인하기 위해 사용했습니다.
- `planning-gate-selector`: route SSOT와 verification script 변경에 맞는 최소 검증 세트를 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 변경, 실행한 검증, 남은 리스크를 `/work` 형식으로 남기기 위해 사용했습니다.

## 변경 이유
- planning v3 transaction override 감사 중 route SSOT 검증 명령인 `corepack pnpm planning:current-screens:guard`가 내부 bare `pnpm` 재호출 때문에 이 로컬 환경에서 `pnpm: not found`로 실패했습니다.
- 저장소 작업 기본 명령은 `pnpm`이지만, 현재 환경은 `corepack pnpm`만 직접 확인되므로 guard script 자체가 package-manager shim 존재 여부에 덜 의존해야 합니다.
- route catalog guard는 PR 전·후 반복 검증에 쓰이는 운영 규칙이므로, 검증 명령이 환경 경로 문제로 막히지 않도록 최소 수정했습니다.

## 핵심 변경
- `planning:current-screens:guard`가 `pnpm test ...` 대신 `vitest run ...`으로 current-screens 테스트 5개 파일을 직접 실행하도록 바꿨습니다.
- `planning:ssot:check`가 `pnpm planning:current-screens:guard` 대신 `planning_ssot_guard.mjs` 이후 같은 `vitest run ...` 세트를 직접 실행하도록 바꿨습니다.
- planning v3 transaction override 사용자 경로는 batch-scoped `/api/planning/v3/batches/[id]/txn-overrides`를 사용하고, legacy `/api/planning/v3/transactions/overrides`는 local-only internal 경계로 유지됨을 정적 감사와 테스트로 확인했습니다.
- `docs/current-screens.md`의 planning v3 official beta entry/deep-link 기준과 실제 `src/app/**/page.tsx` route 집합은 current-screens guard 기준으로 일치했습니다.

## 검증
- `git status --short --branch && git rev-parse HEAD && ls -t work/5/26/*.md | head -n 5` PASS: 작업 전 브랜치, 최신 HEAD, 최신 `/work` 확인
- `corepack pnpm test tests/planning-v3-write-route-guards.test.ts tests/planning-v3-txnOverridesStore.test.ts tests/planning-v3-txnOverridesBatchStore.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-internal-route-contract.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts` PASS: 6 files, 17 tests
- `corepack pnpm planning:current-screens:guard` FAIL(수정 전): 내부 `pnpm test ...` 호출에서 `sh: 1: pnpm: not found`
- `corepack pnpm test tests/planning/catalog/currentScreens.fullRouteSet.test.ts tests/planning/catalog/currentScreens.experimentalRoutes.test.ts tests/planning/catalog/currentScreens.opsRoutes.test.ts tests/planning/catalog/currentScreens.reportRoutes.test.ts tests/planning/catalog/currentScreens.supportRoutes.test.ts` PASS: 5 files, 9 tests
- `command -v pnpm || true && command -v corepack || true && corepack pnpm --version` PASS: `pnpm` 직접 shim 없음, `/usr/bin/corepack`, pnpm `10.29.3`
- `corepack pnpm planning:current-screens:guard` PASS(수정 후): 5 files, 9 tests
- `corepack pnpm planning:ssot:check` PASS: `[planning:ssot:check] PASS`, current-screens 5 files, 9 tests
- `git diff --check -- package.json` PASS

## 남은 리스크
- 이번 수정은 current-screens/SSOT guard의 실행성만 보강했으며, `package.json` 안의 다른 nested `pnpm ...` 스크립트 전체를 일괄 변경하지 않았습니다.
- PR #24 head가 이 커밋으로 바뀌면 GitHub Actions `CI`, `E2E Smoke`를 새 SHA 기준으로 다시 확인해야 합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.
