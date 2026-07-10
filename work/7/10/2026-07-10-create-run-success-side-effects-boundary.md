# 2026-07-10 PR #190 create-run success side-effect 경계 분리

## 작업 범위

- Issue: https://github.com/hsnasforum/financeproject/issues/117
- Replacement PR: https://github.com/hsnasforum/financeproject/pull/190
- 대체 대상: https://github.com/hsnasforum/financeproject/pull/138
- 기준 main: `4cfdbd50cd777140ea7d2873a2d56e00ab9e4bf8`
- 구현 커밋: `d1c6c39255590a9fd2b81209337cf23e7381860d`
- direct downstream: https://github.com/hsnasforum/financeproject/pull/139

## 변경 이유

create-run 성공 저장 뒤 stage metrics와 success audit 순서를 별도 helper가 소유하도록 해 side-effect 변경이 persistence와 public response assembly에 미치는 범위를 줄였습니다.

## 변경 파일

- `src/lib/planning/server/runs/createRunService.ts`
- `src/lib/planning/server/runs/createRunSideEffects.ts`
- `tests/planning-v2-api/create-run-service-boundary.test.ts`
- `tests/planning-v2-api/create-run-side-effects.test.ts`

## 구현 결과

- `recordCreateRunSuccessSideEffects`가 success metrics 후 success audit 순서를 소유합니다.
- metrics 기록 실패 시에도 audit을 시도하고 audit 실패도 성공 응답을 막지 않는 기존 best-effort 동작을 유지합니다.
- helper는 run persistence 완료 후, `buildCreatePlanningRunSuccessResult` 호출 전에 실행됩니다.
- 기존 `recordStageMetrics`, `recordAudit` dependency injection을 그대로 전달합니다.
- helper 단위 테스트가 호출 순서, payload, metrics 실패 시 audit 지속을 확인합니다.

## 계약 영향

- Public URL/API: 변경 없음
- 성공/오류 응답 shape: 변경 없음
- DB schema/Prisma query semantics: 변경 없음
- run store payload/index/migration/trash/legacy fallback: 변경 없음
- cache/revalidation: 변경 없음
- migration 필요 여부: 없음
- 내부 관찰 계약: success metrics -> success audit 순서 유지, 각 side effect best-effort 유지

## 실행한 검증

- focused Vitest: PASS, 3 files / 18 tests
- `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-WrhWMy`
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:regress`: PASS, regression 9 cases / full E2E 10
- `DATABASE_URL=file:./dev.db corepack pnpm test`: 첫 실행 FAIL 1건, 단독 재현과 전체 재실행 결과 아래와 같이 PASS
- `DATABASE_URL=file:./dev.db corepack pnpm test tests/planning/ops/metrics-api-routes.test.ts`: PASS, 1 file / 3 tests
- `DATABASE_URL=file:./dev.db corepack pnpm test`: 재실행 PASS
- `corepack pnpm cleanup:next-artifacts && DATABASE_URL=file:./dev.db corepack pnpm build`: PASS, 227.2초
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --cached --check`: PASS
- 정적 리뷰: finding 없음

## 비재현 테스트 실패

- 첫 전체 Vitest에서 `tests/planning/ops/metrics-api-routes.test.ts`의 `last24h.total > 0` assertion이 0으로 실패했습니다.
- 변경 파일 밖 테스트이며 `PLANNING_OPS_METRICS_STORE_PATH` 등 전역 env를 임시 경로로 교체합니다.
- 해당 파일 단독 실행은 3/3 PASS, 같은 전체 명령 재실행은 PASS였습니다.
- 판정: 이번 production diff와 직접 연결된 재현 가능한 회귀 근거는 없고, 전역 env 기반 metrics 경로의 병렬 파일 간섭 가능성이 남습니다.

## 미실행 검증

- 수동 `docs/planning-v2-5min-selftest.md` 절차는 실행하지 않았습니다.
- production 배포 smoke와 `corepack pnpm release:verify`는 실행하지 않았습니다.
- 문서-only 후속 커밋에는 코드 gate를 다시 실행하지 않고 최종 head Actions만 재확인합니다.

## GitHub Actions 확인

- 코드 head CI: https://github.com/hsnasforum/financeproject/actions/runs/29070024834
  - `verify`: failure, steps 0개
- 코드 head E2E Smoke: https://github.com/hsnasforum/financeproject/actions/runs/29070024897
  - `dart_index_missing`, `dart_index_present`, `core_flows`: failure, steps 0개
- workflow code와 checkout 전 계정/러너 시작 단계 외부 실패입니다.
- 이전에 확인된 Actions billing/spending-limit 실패와 같은 패턴입니다.

## 사용 skill

- `finance-skill-routing`: financeproject 로컬 skill 선택
- `planning-gate-selector`: success side-effect 경계 검증 세트 선택
- `github:github`: PR, Issue, downstream, Actions 상태 확인
- `github:gh-fix-ci`: Actions run, job, step 실행 여부 확인
- `work-log-closeout`: 한글 closeout과 인계 기록
- `manager` subagent: #138 고유 diff와 #139 downstream 관계 재분류
- `reviewer` subagent: metrics/audit 순서, best-effort, DI, persistence/response 위치 정적 검토

## 남은 리스크

- PR #139는 기존 #138 head를 base로 사용하므로 최신 main replacement가 필요합니다.
- #117의 실패 경로 metrics/audit helper 추가 분리는 후속 검토 범위입니다.
- service 수준 persistence -> helper -> response 순서를 한 런타임 assertion으로 묶은 테스트는 없습니다.
- metrics API 테스트의 전역 env 병렬 간섭 가능성이 남아 있습니다.
- GitHub Actions는 billing/spending-limit 문제가 해소되기 전까지 실제 workflow 실행 결과를 제공하지 못합니다.

## 롤백 기준

- create-run 성공 응답이 side-effect 실패로 실패하거나 metrics -> audit 순서가 달라지거나 public 응답/DB/cache 계약이 바뀌면 PR #190을 되돌립니다.

## 다음 작업

1. PR #190 최종 head의 mergeability와 Actions를 재확인합니다.
2. PR #190 병합 후 기존 PR #138을 superseded로 정리합니다.
3. direct downstream PR #139의 최신 main 대비 고유 변경을 재구성합니다.
4. metrics API flaky가 반복되면 별도 Issue로 전역 env 테스트 격리를 다룹니다.
