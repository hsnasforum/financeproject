# Issue #232 Phase B — desktop-local ADR 및 pure deployment policy resolver

## 판정

- ADR decision accepted
- Pure resolver implemented
- Runtime wiring pending
- Supported end-to-end now: none
- Phase B local verification: PASS
- GitHub checks: `NOT_QUERIED_BEFORE_PUSH`

이 기록은 Planning deployment 결정을 문서화하고 아직 runtime에 연결하지 않은
pure policy contract를 추가한 Phase B / PR 1 작업입니다. `desktop-local`을
현재 지원 완료로 표현하지 않습니다.

## 사용자 승인 결정

- Planning v1.x production의 유일한 supported target은 `desktop-local`입니다.
- `desktop-local` end-to-end 지원은 Phase C runtime wiring과
  launcher-established local identity가 완료되기 전까지 `false`입니다.
- `web-single`은 이름만 예약하고 현재 unsupported입니다.
- `web-multi`는 현재 architecture에서 unsupported입니다.
- Missing, unknown, unsupported mode와 desktop-local capability conflict는
  fallback 없이 fail closed합니다.
- Remote mutation, reverse proxy trust, shared writer, production restore apply를
  활성화하지 않습니다.

## 기준과 baseline

- Expected main SHA:
  `daeab493e24e9500e06f0f2b4b368e5c5bdc779d`
- Actual `origin/main` SHA:
  `daeab493e24e9500e06f0f2b4b368e5c5bdc779d`
- Baseline drift: 없음
- Open duplicate PR: 0
- Local runtime:
  - Node: `v22.22.2`
  - pnpm via Corepack: `9.15.9`
  - 별도 Node 20 실행 파일: 없음
- 변경 전 focused baseline:
  - 5 files, 55 tests PASS
  - storage mode guard, local request, current user, Auth.js session,
    middleware security

## ADR

- Path: `docs/adr/0001-planning-deployment-modes.md`
- Status: Accepted
- Decision accepted: `desktop-local` only
- Runtime implementation: pending Phase C
- Supported end-to-end now: none

ADR은 현재 loopback production bind, production Planning auth 강제,
desktop launcher의 local identity 부재, OAuth provider 0개 허용, namespace
flag와 topology 혼합, process-local write lock 한계, active SQLite schema와
remote self-host로 오해될 수 있는 deploy 문서를 기록합니다.

## Resolver

- Canonical implementation:
  `src/lib/planning/deployment/policy.mjs`
- Explicit TypeScript contract:
  `src/lib/planning/deployment/policy.d.mts`
- API:
  - `PLANNING_DEPLOYMENT_MODES`
  - `resolvePlanningDeploymentPolicy(input)`

### Cross-runtime single source

저장소의 기존 `.mjs` + `.d.mts` pattern을 따랐습니다. Policy 판단은 plain
Node ESM이 직접 import하는 `policy.mjs` 한 파일에만 있고, `policy.d.mts`는
TypeScript type declaration만 제공합니다. Runtime transpiler, loader,
dependency, package 또는 tsconfig 변경은 없습니다.

Phase C의 Next/TypeScript consumer와 plain Node ESM startup/launcher가 같은
implementation을 사용할 수 있습니다. 현재 Node `v22.22.2` direct-import
smoke는 PASS했습니다. Node 20 executable은 local environment에 없어 Node
20 실제 실행은 `NOT_RUN`입니다.

### Input facts

- `mode`
- `requestedBindHost`
- `singleUserModeEnabled`
- raw `namespaceEnabled`
- `forwardedHeadersTrusted`
- `rawTrustedAuthHeadersEnabled`
- `desktopLocalIdentityMode`
- `desktopLocalIdentityProvenance`
- `desktopLocalIdentityReady`
- `databaseProvider`
- `databaseConnection`
- `processModel`
- `dataRootKind`
- `proxyMode`

Resolver는 `process.env`, filesystem, network, request headers, Auth.js session을
읽지 않고 입력 객체를 변경하지 않습니다.

### Output and error codes

성공 decision은 정확히 다음 invariant를 반환합니다.

- `mode: "desktop-local"`
- `bindHost: "127.0.0.1"`
- `localOnly: true`
- `remoteAccessAllowed: false`
- `proxyTrust: "none"`
- `forwardedHeadersTrusted: false`
- `processModel: "single"`
- `singleWriter: true`
- `dataRootKind: "local"`
- `userScope: "default"`
- `databaseProvider: "sqlite"`
- `databaseConnection: "file"`
- `identityMode: "desktop-local-session"`
- `identityProvenance: "launcher-process"`
- `rawTrustedAuthHeadersAllowed: false`
- `restoreApplyAllowed: false`

Stable error codes:

- `DEPLOYMENT_MODE_MISSING`
- `DEPLOYMENT_MODE_UNKNOWN`
- `DEPLOYMENT_MODE_UNSUPPORTED`
- `DEPLOYMENT_POLICY_CONFLICT`
- `DEPLOYMENT_AUTH_NOT_READY`

여러 conflict는 canonical field order로 반환됩니다. Decision과 conflict
inventory는 freeze되고, caller mutation이 후속 호출에 영향을 주지 않습니다.

## desktop-local success matrix

다음을 모두 만족할 때만 성공합니다.

- mode는 정확히 `desktop-local`
- bind host는 정확히 `127.0.0.1`
- proxy mode는 `none`
- forwarded header trust는 disabled
- raw trusted auth header는 disabled
- identity mode는 `desktop-local-session`
- identity provenance는 `launcher-process`
- process model은 `single`
- `singleUserModeEnabled=true`
- raw `namespaceEnabled=false`
- data root는 `local`
- database provider는 `sqlite`
- database connection은 local `file`
- `desktopLocalIdentityReady=true`

`localhost`, `0.0.0.0`, `::1`, trusted/untrusted/unknown proxy,
multi/unknown process, shared/unknown data root, PostgreSQL/unknown DB,
multi-user raw namespace와 identity-not-ready 조합은 모두 fail closed합니다.
OAuth provider 수는 policy capability가 아니며 provider count 0도
`desktopLocalIdentityReady=true`인 pure policy decision을 막지 않습니다.

## Unsupported modes

- Missing 또는 blank: `DEPLOYMENT_MODE_MISSING`
- Unknown 또는 비정규 mode: `DEPLOYMENT_MODE_UNKNOWN`
- `web-single`: `DEPLOYMENT_MODE_UNSUPPORTED`
- `web-multi`: `DEPLOYMENT_MODE_UNSUPPORTED`

다른 flag에서 mode를 추론하거나 unsupported mode를 desktop-local로
fallback하지 않습니다.

## 변경 파일

- `docs/adr/0001-planning-deployment-modes.md`
- `src/lib/planning/deployment/policy.mjs`
- `src/lib/planning/deployment/policy.d.mts`
- `tests/planning/deployment/planningDeploymentPolicy.test.ts`
- `work/8/15/2026-08-15-issue-232-phase-b-deployment-policy.md`

Implementation과 declaration을 두 파일로 분리한 이유는 Node ESM과
TypeScript가 loader 변경이나 판단 로직 복제 없이 single source를 공유하기
위해서입니다.

## 변경하지 않은 runtime

- `middleware.ts`
- `src/lib/dev/localRequest.ts`
- `src/lib/planning/api/routeAuth.ts`
- `src/lib/planning/auth/currentUser.ts`
- `src/lib/planning/store/namespace.ts`
- `src/lib/planning/store/userScope.ts`
- `src/lib/planning/storage/storeWriteLock.ts`
- `src/lib/planning/storage/atomicWrite.ts`
- `src/lib/auth/config.ts`
- `scripts/next_prod_safe.mjs`
- `scripts/planning_storage_mode_guard.mjs`
- `scripts/start_local.mjs`
- `scripts/planning_v2_desktop_launch.mjs`
- `.env.example`
- `docs/deploy.md`
- `docs/current-screens.md`

Public API, stored data format, database schema, migration, cache contract,
production bind, auth requirement, local request 판정, trusted header 동작,
namespace path와 restore apply 상태는 변경하지 않았습니다.

## 실행한 명령과 실제 결과

1. `git fetch origin --prune` — PASS
2. open PR 및 #232/deployment-policy 중복 검색 — open duplicate 0
3. `DATABASE_URL=file:/tmp/finance-issue-232-policy.db corepack pnpm vitest run tests/planning/deployment/planningDeploymentPolicy.test.ts`
   — 1 file / 59 tests PASS
4. `DATABASE_URL=file:/tmp/finance-issue-232-lint.db corepack pnpm lint`
   — PASS
5. `DATABASE_URL=file:/tmp/finance-issue-232-test.db corepack pnpm test`
   — 834 files / 3,064 tests PASS
6. `DATABASE_URL=file:/tmp/finance-issue-232-build.db corepack pnpm build`
   — PASS; compile, TypeScript, 250 static pages generated
7. runtime entry point import scan — resolver import 없음, PASS
8. runtime entry point `origin/main` diff audit — 변경 없음, PASS
9. `git diff --cached --check` — PASS

전체 test와 build가 갱신한 범위 밖 generated reports 3개는 변경 전 tracked
content로 복구했습니다. Policy 또는 runtime consumer 변경과 관련된
compile/test 실패는 없습니다.

## 미실행 검증

- Node 20 direct import: `NOT_RUN`
  - Reason: 별도 Node 20 executable이 local environment에 없습니다.
  - Node `v22.22.2` plain ESM direct-import smoke는 contract test에서 PASS했습니다.
- Local `pnpm e2e:rc`: `NOT_RUN`
  - Reason: Phase B adds a pure unused policy contract and does not change
    runtime route, UI, selector, startup, or authentication behavior.
- GitHub E2E Smoke: push 및 Draft PR 생성 후 checks 1회 조회 대상입니다.

## GitHub checks

이 기록 작성 시점은 push 전이므로 `NOT_QUERIED_BEFORE_PUSH`입니다. 최종 push
후 CI, E2E Smoke, dependency audit, typecheck/verify/build와 contract test를
한 번만 조회합니다. Pending 또는 queued이면 최종 상태는
`AWAITING_EXTERNAL_CHECKS`이며 polling, rerun 또는 반복 조회를 하지 않습니다.

## Phase C 인계

- `PLANNING_DEPLOYMENT_MODE`와 runtime facts의 strict normalization
- `next_prod_safe.mjs`와 desktop launcher startup preflight wiring
- middleware, `currentUser`, `routeAuth`의 같은 resolver decision 소비
- launcher-established local session/capability 구현
- raw trusted header가 아닌 desktop local identity 검증
- authenticated production desktop CRUD smoke
- web mode startup rejection과 fail-closed diagnostics

Phase C는 security boundary와 production runtime behavior를 바꾸므로 별도
승인·보안 감사 범위로 진행해야 합니다.

## Rollback

이 PR의 ADR, resolver, declaration, contract test와 작업 기록을 되돌립니다.
Resolver는 runtime에 연결되지 않아 rollback은 production bind, auth, storage,
DB 또는 stored data를 변경하지 않습니다.

## 남은 위험

- Accepted decision이 아직 runtime에서 강제되지 않습니다.
- Desktop launcher는 아직 local identity/session을 만들지 않습니다.
- 기존 deploy/env 문서는 Phase D 전까지 current support 상태를 과장해 읽힐 수
  있습니다.
- Node 20 실제 direct-import 실행은 이 환경에서 검증하지 못했습니다.
- `web-single`과 `web-multi`는 계속 unsupported입니다.

## 사용한 skill

- `finance-skill-routing`: Issue #232 범위에 필요한 최소 local skill 조합을
  선택하는 데 사용했습니다.
- `planning-gate-selector`: pure policy/ADR 변경에 맞는 focused test, lint,
  전체 test, build와 runtime 미연결 검증을 선택하는 데 사용했습니다.
- `work-log-closeout`: 변경·검증·잔여 위험을 이 문서 형식으로 정리하는 데
  사용했습니다.

## 완료 상태

- `ADR_DECISION_RECORDED=true`
- `PURE_POLICY_RESOLVER_IMPLEMENTED=true`
- `RUNTIME_POLICY_WIRED=false`
- `DESKTOP_LOCAL_END_TO_END_SUPPORTED=false`
- `WEB_SINGLE_SUPPORTED=false`
- `WEB_MULTI_SUPPORTED=false`
- `REMOTE_MUTATION_ENABLED=false`
- `RESTORE_APPLY_ENABLED=false`
