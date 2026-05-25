# 2026-05-25 verify route scan typecheck hardening

## 변경 파일
- `package.json`
- `tests/next-artifact-prune.test.ts`
- `tests/runtime-color-env.test.ts`
- `tests/planning-v2/reportInterpretationAdapter.test.ts`
- `tests/planning/ui/workspaceGroups.test.ts`
- `tests/planning/ui/workspaceRuntimeBundle.test.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-draft-create-profile-api.test.ts`
- `tests/planning-v3-draft-preview-api.test.ts`
- `tests/planning-v3-drafts-remote-host-api.test.ts`
- `docs/schema-drift-report.md`
- `docs/data-freshness-report.md`
- `docs/dart-rules-quality-report.md`
- `work/5/25/2026-05-25-verify-route-scan-typecheck-hardening.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: planning v3 draft/batch fixture를 현재 저장 계약에 맞추면서 payload shape를 새로 확장하지 않도록 확인했습니다.
- `planning-gate-selector`: release/ops script 연결 변경에 맞춰 `pnpm verify`와 `pnpm build`를 포함한 검증 범위를 정했습니다.
- `work-log-closeout`: 실제 실행한 명령과 결과를 이번 `/work` 기록으로 남겼습니다.

## 변경 이유
- `sec:scan:routes`가 production 비노출 surface를 정적으로 확인하지만 기본 보안/검증 체인에 연결되지 않아 회귀를 놓칠 수 있었습니다.
- `pnpm verify`에 `sec:check`를 포함하자 기존 테스트 fixture의 타입 drift가 드러나 전체 검증이 typecheck에서 멈췄습니다.
- planning v3 draft fixture는 현재 `draftStore` 계약인 `source + meta + payload` 구조에 맞아야 하고, batch import metadata helper는 `provenance` 필수 계약을 따라야 합니다.

## 핵심 변경
- `package.json`에서 `sec:check`가 `security_check.mjs` 뒤에 `security_route_guard_scan.mjs`를 실행하도록 연결하고, `verify`가 `sec:check`를 포함하도록 했습니다.
- `next_artifact_prune` 테스트의 JS import 결과 callback 타입을 명시해 `noImplicitAny` 오류를 제거했습니다.
- runtime color env 테스트 fixture에 `NODE_ENV`를 명시해 현재 `ProcessEnv` 타입 계약과 맞췄습니다.
- planning v2 interpretation 테스트는 `summaryEvidence`의 배열/객체 union을 좁힌 뒤 객체 evidence를 검증하도록 바꿨습니다.
- workspace 테스트 fixture는 현재 feature flag, locale, run record 필수 필드 계약에 맞췄습니다.
- planning v3 draft/create/preview/remote-host fixture는 top-level `cashflow`/`draftPatch` 대신 `payload`를 사용하고, row count는 `meta.rows`로 옮겼습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- package.json tests/next-artifact-prune.test.ts tests/runtime-color-env.test.ts tests/planning-v2/reportInterpretationAdapter.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec tsc --noEmit` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/next-artifact-prune.test.ts tests/runtime-color-env.test.ts tests/planning-v2/reportInterpretationAdapter.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts` 통과: 9 files, 50 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm verify` 통과: `sec:check` 안에서 `[sec:scan:routes] PASS devRoutes=38 opsRoutes=38 prodHiddenPages=7 publicMutationAllowlist=7 opsActions=3`, 전체 655 files / 2018 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard` 통과

## 남은 리스크
- `package.json`에는 이번 라운드의 `sec:check`/`verify` 연결 외에도 기존 dependency, e2e, worktree script 변경이 함께 섞여 있습니다. stage 또는 PR 분리 시 범위 확인이 필요합니다.
- `pnpm verify` 과정에서 `docs/schema-drift-report.md`, `docs/data-freshness-report.md`, `docs/dart-rules-quality-report.md`가 재생성됐습니다. 특히 freshness report는 `total=8 fresh=0 stale=8` 상태를 보고하지만 gate 실패는 아닙니다.
- 이번 라운드는 e2e 전체(`pnpm e2e:rc`)를 다시 돌리지는 않았습니다. 직전 라운드에서 production hidden surface focused e2e는 통과했습니다.

## 다음 라운드
- 현재 dirty worktree의 변경 묶음을 `worktree:scope` 기준으로 다시 나누고, PR에 들어갈 최소 단위를 확정합니다.
- `package.json`의 기존 dependency/스크립트 변경이 이번 보안 검증 연결과 같은 PR에 남아야 하는지 별도 확인합니다.
- freshness report의 stale 데이터가 사용자 노출 판단에 영향을 주는 화면부터 우선순위화합니다.
