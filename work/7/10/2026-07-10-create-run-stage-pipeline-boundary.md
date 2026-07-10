# 2026-07-10 PR #189 create-run stage pipeline 경계 분리

## 작업 범위

- Issue: https://github.com/hsnasforum/financeproject/issues/117
- Replacement PR: https://github.com/hsnasforum/financeproject/pull/189
- 대체 대상: https://github.com/hsnasforum/financeproject/pull/137
- 기준 main: `7d556e82f53ec26789b2aa068bdbd67064bd442a`
- 구현 커밋: `121bd040f006e5e7bd660778366a5dc500edb1d6`
- direct downstream: https://github.com/hsnasforum/financeproject/pull/138

## 변경 이유

`createPlanningRun`이 직접 소유하던 Monte Carlo budget 판단, stage plan state 생성, pipeline 실행, stage output 해석을 별도 경계로 이동해 stage 로직 변경이 persistence와 public response assembly에 미치는 범위를 줄였습니다.

## 변경 파일

- `src/lib/planning/server/runs/createRunService.ts`
- `src/lib/planning/server/runs/createRunStagePipeline.ts`
- `tests/planning-v2-api/create-run-service-boundary.test.ts`
- `tests/planning-v2-api/create-run-stage-pipeline.test.ts`
- `tests/planning-v2-api/persistence-routes.test.ts`

## 구현 결과

- `runCreatePlanningRunStagePipeline`이 budget, stage plan, pipeline 실행, output 해석을 소유합니다.
- 기존 `runPipeline`, `matchCandidatesProvider` dependency injection 계약은 유지했습니다.
- `createPlanningRun`은 simulate failure guard, persistence, metrics/audit, success response 흐름을 그대로 소유합니다.
- output 해석 예외가 발생하면 `CreatePlanningRunStageOutputResolutionError`가 이미 완료된 stages를 보존하고 서비스 catch가 metrics와 500 `meta.stages`에 복원합니다.
- 실패 컨텍스트 테스트는 persistence 미호출, metrics stages, audit, 응답 meta, metrics 이후 audit 호출 순서를 확인합니다.

## 리뷰 조치

- 1차 정적 리뷰에서 output 해석 예외 시 helper가 반환되기 전에 stages가 유실될 수 있다는 중간 심각도 finding이 있었습니다.
- 내부 오류 타입과 서비스 복원 로직, 서비스 수준 회귀 테스트를 추가했습니다.
- 같은 리뷰어의 재검토 결과 finding 없음으로 확인했습니다.

## 계약 영향

- Public URL/API: 변경 없음
- 성공/오류 응답 shape: 변경 없음
- `/api/planning/run`, `/api/planning/v2/run`, `/api/planning/v2/runs`: 계약 유지
- DB schema/Prisma query semantics: 변경 없음
- run store payload/index/migration/trash/legacy fallback: 변경 없음
- cache/revalidation: 변경 없음
- migration 필요 여부: 없음

## 실행한 검증

- focused Vitest 최종 실행: PASS, 3 files / 16 tests
- `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-Q6lyGc`
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:regress`: PASS, regression 9 cases / full E2E 10
- `DATABASE_URL=file:./dev.db corepack pnpm test`: PASS
- `corepack pnpm cleanup:next-artifacts && DATABASE_URL=file:./dev.db corepack pnpm build`: PASS, 250.4초
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --cached --check`: PASS
- 정적 재검토: finding 없음

## 미실행 검증

- 수동 `docs/planning-v2-5min-selftest.md` 절차는 실행하지 않았습니다.
- production 배포 smoke와 `corepack pnpm release:verify`는 이번 내부 service 경계 범위에서 실행하지 않았습니다.
- 문서-only 후속 커밋에는 코드 gate를 다시 실행하지 않고 최종 head Actions 상태만 재확인합니다.

## GitHub Actions 확인

- 코드 head E2E Smoke: https://github.com/hsnasforum/financeproject/actions/runs/29069159052
  - `dart_index_present`, `core_flows`, `dart_index_missing`: failure, steps 0개
- 코드 head CI: https://github.com/hsnasforum/financeproject/actions/runs/29069159074
  - `verify`: failure, steps 0개
- workflow code와 checkout이 실행되기 전의 계정/러너 시작 단계 외부 실패입니다.
- 이전에 확인된 Actions billing/spending-limit 실패와 같은 패턴이며, 현재 API 응답에는 별도 상세 메시지가 노출되지 않았습니다.

## 사용 skill

- `finance-skill-routing`: financeproject 작업의 로컬 skill 선택
- `planning-gate-selector`: stage service 경계 변경의 최종 검증 세트 선택
- `github:github`: PR, Issue, downstream stack, Actions 상태 확인
- `github:gh-fix-ci`: Actions run, job, step 실행 여부 확인
- `work-log-closeout`: 한글 closeout과 다음 작업 인계
- `manager` subagent: #137의 고유 diff와 #138 downstream 관계 재분류
- `reviewer` subagent: 실패 semantics, DI, metrics/audit/persistence 정적 검토와 수정 재검토

## 남은 리스크

- PR #138은 기존 #137 head를 base로 사용하므로 최신 main replacement가 필요합니다.
- #117의 audit/metrics runtime persistence dependency 추가 분리는 후속 범위입니다.
- Monte Carlo budget은 helper 단위에서 고정했지만 service/route 응답 전체를 전용 단일 assertion으로 묶은 테스트는 없습니다.
- GitHub Actions는 계정 billing/spending-limit 문제가 해소되기 전까지 실제 workflow 실행 결과를 제공하지 못합니다.

## 롤백 기준

- stage status, Monte Carlo budget skip, simulate failure meta, persistence record assembly, metrics/audit 순서, public success/error shape 중 하나라도 기존 계약과 다르게 관측되면 PR #189를 되돌립니다.

## 다음 작업

1. PR #189 최종 head의 mergeability와 Actions를 재확인합니다.
2. PR #189 병합 후 기존 PR #137을 superseded로 정리합니다.
3. direct downstream PR #138의 최신 main 대비 고유 변경을 재구성합니다.
4. Issue #117에 완료 범위와 남은 audit/metrics dependency 후속을 기록합니다.
