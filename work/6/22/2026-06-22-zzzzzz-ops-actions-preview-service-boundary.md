# 2026-06-22 Ops Actions Preview Service Boundary

## 변경 파일
- `src/app/api/ops/actions/preview/route.ts`
- `src/lib/ops/actions/actionPreviewRouteService.ts`
- `tests/planning/ops/ops-actions-preview-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-zzzzzz-ops-actions-preview-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 작업 기본/조건부 skill 선택 기준 확인
- `planning-gate-selector`: preview route 변경의 최소 검증 세트 선정
- `work-log-closeout`: `/work` 종료 기록 형식 확인

## 변경 이유
- `/api/ops/actions/preview` route가 action definition lookup, params validation, preview 실행, preview token 발급, 응답 조립까지 직접 담당하고 있었습니다.
- route는 dev guard, auth, body read, 응답 매핑만 담당하고, action preview 도메인 작업은 service 계층으로 이동하는 방향이 이전 ops route 정리 흐름과 맞습니다.

## 핵심 변경
- `actionPreviewRouteService`를 추가해 actionId 정규화, definition lookup, params validation, `previewOpsAction`, preview token 발급, preview 응답 데이터 조립을 route 밖으로 이동했습니다.
- preview route는 기존 `ok/message/meta/data` public payload shape를 유지하면서 service 결과의 `validation-error/internal-error/completed`만 매핑합니다.
- route가 registry, preview token, action type에 직접 접근하지 못하도록 service boundary 회귀 테스트를 추가했습니다.
- AGENTS.md의 Spark 조건부 모델 지침에 맞춰 정적 탐색은 `gpt-5.3-codex-spark` + `xhigh` 서브 에이전트로 분리하고, 최종 구현/검증/판정은 메인 에이전트가 수행했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/actions-preview-route.test.ts tests/planning/ops/ops-actions-preview-route-service-boundary.test.ts tests/planning/ops/preview-token.test.ts tests/planning/ops/actions-run-route.test.ts tests/planning/ops/ops-actions-run-route-service-boundary.test.ts`
- PASS: `git diff --check`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm test` (712 files, 2,280 tests)
- PASS: `corepack pnpm planning:ssot:check`
- FAIL then PASS: 첫 `corepack pnpm verify`는 `tests/planning/ops/backup-api.test.ts`의 delta backup 1건이 실패했습니다. preview 변경과 무관한 backup 경로였고, `./node_modules/.bin/vitest run tests/planning/ops/backup-api.test.ts` 단독 재실행은 30개 테스트 모두 통과했습니다.
- PASS: 두 번째 `corepack pnpm verify` (712 files, 2,280 tests)
- 정리: `pnpm verify`가 생성한 `docs/schema-drift-report.md`, `docs/data-freshness-report.md`, `docs/dart-rules-quality-report.md`는 이번 PR 범위가 아니어서 원상 복구했습니다.
- PASS: `git diff --check --cached`
- PASS: `corepack pnpm multi-agent:guard`

## 남은 리스크
- preview service 자체 단위 테스트는 추가하지 않았습니다. 기존 route contract 테스트와 service boundary 테스트로 route public shape와 책임 분리를 고정했습니다.
- UI/e2e는 실행하지 않았습니다. 응답 계약과 `/ops` 화면 경로는 바꾸지 않았고, route 내부 책임 이동만 포함했습니다.
- 첫 verify의 backup delta 실패는 단독 재현과 재verify에서 사라져 일회성 병렬 테스트 간섭 가능성으로 기록합니다.

## 다음 라운드
- 우선 후보: `src/app/api/ops/support/export.zip/route.ts`의 export orchestration과 직접 데이터 접근을 service 계층으로 분리하고 boundary 테스트를 추가합니다.
