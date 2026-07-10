# 2026-07-10 create-run 실패 side-effect 경계 분리

## 변경 파일

- `src/lib/planning/server/runs/createRunService.ts`
- `src/lib/planning/server/runs/createRunSideEffects.ts`
- `tests/planning-v2-api/create-run-service-boundary.test.ts`
- `tests/planning-v2-api/create-run-side-effects.test.ts`
- `tests/planning-v2-api/persistence-routes.test.ts`
- `work/7/10/2026-07-10-create-run-failure-side-effects-boundary.md`

## 사용 skill

- `finance-skill-routing`: 이번 구현/검증 라운드의 최소 skill 조합 선택
- `planning-gate-selector`: planning v2 실패 경계 변경에 필요한 검증 세트 선택
- `github:github`: PR #139 고유 diff, PR #191 상태, Issue #117, downstream 관계 확인
- `github:gh-fix-ci`: GitHub Actions run/job/step 실행 여부 확인
- `work-log-closeout`: 한글 closeout 형식과 실제 실행 결과 기록

## 변경 이유

- 기존 PR #139는 이미 병합된 PR #190 head를 base로 둔 stale stacked PR이어서 최신 `main` 기준 replacement가 필요했습니다.
- create-run 실패 경로의 audit/metrics primitive 호출이 service에 남아 있어 side-effect 순서 변경이 orchestration과 public 오류 응답 조립에 영향을 줄 수 있었습니다.
- stage 없는 실패, parse failure의 동기 호출과 `recordId` 경계는 기존 테스트만으로 직접 고정되지 않았습니다.

## 핵심 변경

- `recordCreateRunFailureAudit`가 audit-only 실패와 `recordId`의 undefined 생략/null 보존을 담당합니다.
- `recordCreateRunFailureSideEffects`가 stage가 있는 실패의 metrics -> audit 순서를 소유하며, 각 기록 실패는 기존처럼 best-effort로 처리합니다.
- parse/feature flag/input-context 실패는 audit-only helper를 사용하고 simulate/stage/catch 실패는 공통 failure side-effect helper를 사용합니다.
- PR #189의 `CreatePlanningRunStageOutputResolutionError`에서 복원한 stages는 기존처럼 failure metrics와 public `meta.stages`에 유지됩니다.
- stage 없는 early pipeline failure는 metrics를 호출하지 않고 audit만 기록하며 기존 `{ ok, code, message, status, meta }` 오류 shape를 유지합니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, run-store payload/index/migration/trash/legacy fallback, cache/revalidation은 변경하지 않았습니다.

## 검증

- focused Vitest: PASS, 3 files / 24 tests
  - `DATABASE_URL=file:./dev.db corepack pnpm test tests/planning-v2-api/create-run-side-effects.test.ts tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/persistence-routes.test.ts`
- `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8건
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-qoHRuN`
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:regress`: PASS, regression 9건 / full E2E 10건
- `DATABASE_URL=file:./dev.db corepack pnpm test`: PASS, 782 files / 2,602 tests
- `corepack pnpm cleanup:next-artifacts && DATABASE_URL=file:./dev.db corepack pnpm build`: PASS, 243.2초
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --cached --check`: PASS
- 정적 리뷰: 기능 finding 없음. Low 테스트 공백 2건을 parse 엔트리포인트와 stage 없는 서비스 실패 테스트로 보강했습니다.
- 구현 커밋: `384607f05b17ed093975bfb2304ad7a57de2ce52`
- replacement PR: https://github.com/hsnasforum/financeproject/pull/191
- 대체 대상 PR: https://github.com/hsnasforum/financeproject/pull/139
- PR #191 코드 head Actions:
  - CI: https://github.com/hsnasforum/financeproject/actions/runs/29071024749, `verify` failure, steps 0개
  - E2E Smoke: https://github.com/hsnasforum/financeproject/actions/runs/29071024763, 3 jobs failure, 각 steps 0개
  - workflow code/checkout 전 계정 또는 러너 시작 단계 실패이며 이전 billing/spending-limit 패턴과 같습니다.
- 미실행: 수동 `docs/planning-v2-5min-selftest.md`, production 배포 smoke, `corepack pnpm release:verify`

## 남은 리스크

- 실제 audit/metrics 저장소 장애는 기존처럼 로그만 남기고 요청을 막지 않으므로 운영 로그 관찰이 필요합니다.
- direct downstream PR #158과 이후 `#159 -> #160 -> #164 -> #167 -> #168 -> #179 -> #180 -> #184` stack은 최신 `main` 기준으로 다시 분류해야 합니다.
- GitHub Actions billing/spending-limit 문제가 해소되기 전에는 원격 workflow의 실제 코드 실행 결과를 얻을 수 없습니다.
- 롤백 기준은 기존 실패 응답 shape 변경, stage failure의 metrics -> audit 순서 변경, side-effect 예외의 요청 전파, DB/cache 계약 변화입니다.

## 다음 라운드 우선순위

- PR #191의 최종 head, mergeability, 리뷰와 Actions 상태를 재확인합니다.
- PR #191 병합 후 PR #139를 superseded로 정리하고 Issue #117에 근거를 남깁니다.
- direct downstream PR #158의 최신 `main` 대비 고유 변경을 재분류합니다.
