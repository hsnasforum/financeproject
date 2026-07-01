# 2026-06-28 P2-05 quality gate plan

## 변경 파일
- `work/6/28/2026-06-28-p2-05-quality-gate-plan.md`

## 사용 skill
- `planning-gate-selector`: package/CI/release/guard script 변경 범위에 맞는 필수 검증 명령과 final gate 우선순위를 고르는 데 사용했습니다.
- `work-log-closeout`: `/work` 계획 노트의 섹션 순서와 검증/리스크 기록 형식을 맞추는 데 사용했습니다.

## 변경 이유
- [사실] `tests/quality-gates-registry.test.ts`는 `scripts/quality_gates.mjs`, `scripts/quality_gates_runner.mjs`, shared `QUALITY_GATE_SUITES`, discovery-based route coverage를 기대하지만 현재 저장소에는 해당 스크립트가 없습니다.
- [사실] `package.json`, `.github/workflows/ci.yml`, `scripts/release_verify.mjs`, `scripts/planning_v2_complete.mjs`, `tests/planning/auth/authConfigContract.test.ts`, `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`가 quality gate 정의와 소비 방식을 각각 따로 들고 있습니다.
- [해석] 이번 P2-05는 사용자 화면 기능 추가가 아니라 planning auth/release/CI 품질 게이트 SSOT를 registry와 자동 발견 방식으로 수렴시키는 인프라 라운드입니다.
- [가정] release gate 용어 또는 순서가 바뀌면 `docs/release.md`, `docs/maintenance.md`, `docs/planning-v2-release-checklist.md`까지 후속 갱신이 필요할 수 있습니다.

## 단계별 작업 계획
1. 단계: quality gate SSOT 설계
   목적: gate ID, command, suite membership, required/optional/advisory 분류, auth 회귀 테스트 파일 집합을 `scripts/quality_gates.mjs` 같은 단일 registry로 정의합니다.
   추천 에이전트 타입: `planner`
2. 단계: runner 및 소비자 통합
   목적: `package.json`, `scripts/release_verify.mjs`, `scripts/planning_v2_complete.mjs`, `.github/workflows/ci.yml`가 하드코딩 배열과 긴 명령문 대신 registry/runner를 소비하도록 바꿉니다.
   추천 에이전트 타입: `developer`
3. 단계: auth/user-scope 자동 발견 회귀 하드닝
   목적: `tests/planning/auth/authConfigContract.test.ts`를 registry runner 계약에 맞추고, `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`의 fixed count/proxy list를 discovery helper 중심으로 바꿉니다.
   추천 에이전트 타입: `developer`
4. 단계: guard/문서 일치성 점검
   목적: ESLint/Planning guard scripts와 release 문서가 새 registry contract와 충돌하지 않는지 점검하고, 필요한 문서 후속 범위를 잠급니다.
   추천 에이전트 타입: `reviewer`
5. 단계: single-owner 게이트 검증
   목적: targeted regression -> `planning:auth:check` -> `planning:v2:complete` -> `release:verify` -> `build` 순으로 실제 orchestration이 유지되는지 메인 에이전트가 확정합니다.
   추천 에이전트 타입: `tester`

## 직접 변경
- 코드 파일은 수정하지 않았고, P2-05 구현 전용 계획과 영향 범위만 문서화했습니다.
- 현재 확인한 첫 blocker는 `tests/quality-gates-registry.test.ts`의 registry module 부재입니다.
- 작업 중 `git status --short`에서 `?? tests/quality-gates-registry.test.ts`를 확인했지만, 기존 사용자 변경으로 보고 수정하거나 되돌리지 않았습니다.

## 영향 범위
- 영향 파일:
  - `package.json`
  - `.github/workflows/ci.yml`
  - `scripts/release_verify.mjs`
  - `scripts/planning_v2_complete.mjs`
  - `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
  - `tests/planning/auth/authConfigContract.test.ts`
  - `tests/quality-gates-registry.test.ts`
  - `scripts/planning_v2_static_guard.mjs`
  - `scripts/planning_v2_engine_guard.mjs`
  - `scripts/planner_deprecated_guard.mjs`
  - `scripts/planning_v2_ssot_guard.mjs`
  - [가정] `scripts/quality_gates.mjs`
  - [가정] `scripts/quality_gates_runner.mjs`
- 사용자 경로:
  - 직접적인 신규 화면 경로 변화는 없습니다.
  - 운영자/개발자 경로로는 CI `verify` job, `pnpm planning:auth:check`, `pnpm planning:v2:complete`, `pnpm release:verify`가 직접 영향을 받습니다.
  - 간접 보호 범위는 `/api/planning/*`, `/api/planner/compute`, `/api/recommend`, `/api/products/candidates`, `/api/ops/actions/*` auth/user-scope 회귀 커버리지입니다.
- 데이터 흐름:
  - `quality gate registry -> gate runner -> package.json scripts / release_verify / planning_v2_complete / CI workflow`
  - `route file auto discovery -> planning auth coverage tests -> routeAuth current-user scope enforcement`
  - `planning guard scripts -> 정적 스캔 결과 -> release/complete suite 조합`
- 즉시 막는 핵심 경로와 메인 에이전트가 로컬에서 직접 처리할 일:
  - `tests/quality-gates-registry.test.ts`를 통과시키는 registry schema와 runner 소유권 결정
  - `package.json`, `scripts/release_verify.mjs`, `scripts/planning_v2_complete.mjs`, `.github/workflows/ci.yml`의 gate 호출 경로 통합
  - `pnpm planning:v2:complete`, `pnpm release:verify`, `pnpm build` 같은 shared final gate 단독 실행
- 병렬 배정 가능한 조사/검증/문서화 작업:
  - `researcher`: docs/release 계열과 current script contract 사이의 중복 정의 목록 수집
  - `tester`: planning auth route discovery가 바꿔야 할 fixed count/proxy list 후보만 정리
  - `documenter`: registry 도입 시 후속 갱신이 필요한 release/maintenance 문서 목록 초안 작성
- 먼저 실패해야 할 회귀 테스트:
  - `corepack pnpm test tests/quality-gates-registry.test.ts`
    - [사실] 현재 FAIL. `../scripts/quality_gates.mjs` import 실패로 suite 초기화가 멈춥니다.
  - `corepack pnpm test tests/planning/auth/authConfigContract.test.ts`
    - [예상] `planning:auth:check`가 registry runner 문자열로 바뀌지 않으면 FAIL합니다.
  - `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
    - [예상] fixed route count와 proxy 예외 리스트가 discovery helper로 대체되지 않으면 FAIL합니다.
- 필수 검증 명령:
  - `corepack pnpm test tests/quality-gates-registry.test.ts tests/planning/auth/authConfigContract.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
  - `corepack pnpm planning:auth:check`
  - `node --check scripts/quality_gates.mjs scripts/quality_gates_runner.mjs scripts/release_verify.mjs scripts/planning_v2_complete.mjs`
  - `corepack pnpm planning:v2:complete`
  - `corepack pnpm release:verify`
  - `corepack pnpm build`
  - `git diff --check -- package.json .github/workflows/ci.yml scripts/release_verify.mjs scripts/planning_v2_complete.mjs tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/auth/authConfigContract.test.ts [추가된 registry script]`
- 중단 조건:
  - registry schema가 `release:verify`의 preflight/early/optional/late/advisory 순서를 손실 없이 표현하지 못하면 caller 수정 전에 schema를 다시 잠급니다.
  - route auto discovery가 shared ops route나 raw download route를 잘못 user-owned auth boundary로 승격하면 fixed list 제거를 중단하고 예외 분류를 먼저 확정합니다.
  - 현재 untracked `tests/quality-gates-registry.test.ts`의 기대 계약이 브랜치 owner 의도와 다르면 구현 전에 SSOT를 다시 확인해야 합니다.

## 검증
- `corepack pnpm test tests/quality-gates-registry.test.ts`
  - FAIL: `Cannot find module '../scripts/quality_gates.mjs' imported from /home/xpdlqj/code/finance/tests/quality-gates-registry.test.ts`

## 이번 라운드 완료 항목
- 최신 `/work` 기준으로 `2026-06-28-p2-04-report-contract.md`와 최근 verification note를 읽고 P2-05 범위를 이어받았습니다.
- 관련 스크립트와 테스트(`package.json`, CI, `release_verify`, `planning_v2_complete`, auth coverage/auth config contract, planning guard scripts, `tests/quality-gates-registry.test.ts`)의 현재 결합 지점을 확인했습니다.
- P2-05를 5단계로 분해하고, 영향 파일/사용자 경로/데이터 흐름/실패 우선 테스트/필수 검증/중단 조건을 본 문서에 고정했습니다.

## 남은 리스크
- `tests/quality-gates-registry.test.ts`는 현재 untracked 상태이므로, 구현 라운드에서는 이 테스트를 공식 contract로 채택할지부터 확인이 필요합니다.
- release/maintenance 문서는 현재 gate 순서를 서술하고 있어, registry 도입 후 명령 이름이나 계층이 바뀌면 문서 drift가 다시 생길 수 있습니다.
- planning auth route discovery는 proxy/download/shared ops 예외를 잘못 흡수하면 false positive를 만들 수 있어, 단순 문자열 제거만으로 끝내면 위험합니다.

## 다음 라운드 우선순위
- 1) `scripts/quality_gates.mjs`와 `scripts/quality_gates_runner.mjs`의 registry schema/CLI contract 확정
- 2) `package.json`, `scripts/release_verify.mjs`, `scripts/planning_v2_complete.mjs`, `.github/workflows/ci.yml` 소비자 통합
- 3) `tests/planning/auth/authConfigContract.test.ts`와 `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`를 registry/discovery contract에 맞게 정렬
- 4) single-owner 순서로 targeted tests -> `planning:auth:check` -> `planning:v2:complete` -> `release:verify` -> `build` 검증
