# 2026-07-10 create-run input context boundary

## 변경 파일
- Issue: https://github.com/hsnasforum/financeproject/issues/117
- 새 PR: https://github.com/hsnasforum/financeproject/pull/187
- 대체 대상 PR: https://github.com/hsnasforum/financeproject/pull/134
- base: `f9490d3808f06aaedf5f63ea1a94c9b6ffbf0277`
- code commit: `f1425e9b3c9baf2521b219376d1cd050737d58cf`
- `src/lib/planning/server/runs/createRunInputContext.ts`
- `src/lib/planning/server/runs/createRunService.ts`
- `tests/planning-v2-api/create-run-input-context.test.ts`
- `tests/planning-v2-api/create-run-service-boundary.test.ts`
- `work/7/10/2026-07-10-create-run-input-context-boundary.md`

## 사용 skill
- `finance-skill-routing`: planning v2 create-run 변경의 기본 skill 조합을 유지했습니다.
- `github:github`: PR #134 상태/patch/review와 새 PR 생성을 connector로 처리했습니다.
- `planning-gate-selector`: input-context route/service 변경에 필요한 focused/planning/compat/regress/full/build gate를 선정했습니다.
- `work-log-closeout`: 실행 사실, 영향 범위, 남은 리스크와 다음 작업을 정리했습니다.
- `manager` subagent: PR #134 고유 diff가 최신 main에 미충족임을 확인하고 4-file 재구성을 제안했습니다.
- `reviewer` subagent: public error, audit, 호출 순서, throw 경계, scenario 변환과 후속 persistence/metrics 흐름을 정적 대조했습니다.

## 변경 이유
- PR #186 병합 후에도 create-run service가 profile load, scenario 처리, preflight, assumptions resolve/error mapping을 직접 소유했습니다.
- PR #134는 오래된 stacked base를 사용하므로 최신 main에서 고유 4-file 변경만 다시 구성했습니다.
- 이동된 입력 준비 정책을 route 전체 없이 단위 테스트할 수 있게 해 변경 영향 범위를 input preparation phase로 줄였습니다.

## 핵심 변경
- `createRunInputContext.ts`가 profile 조회, scenario baseline, canonicalization, scenario 적용, preflight, assumptions resolve를 담당합니다.
- service는 feature flag 확인 후 helper 결과를 받아 stage/persistence/metrics/audit/response 흐름을 이어갑니다.
- 원본 PR #134가 issue 존재 여부로 audit 메시지를 추론하던 부분을 명시적 `auditMessage`로 바꿨습니다.
- explicit scenario patch validation은 기존 `scenario apply failed`, unsupported legacy patch는 기존 `scenario validation failed`를 유지합니다.
- missing profile, success, missing baseline, 두 scenario failure, preflight, 세 assumptions error kind를 9개 helper tests로 고정했습니다.

## 검증
- `DATABASE_URL=file:./dev.db corepack pnpm test tests/planning-v2-api/create-run-input-context.test.ts tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/create-run-service-modules.test.ts tests/planning-v2-api/create-run-persistence.test.ts tests/planning-v2-api/persistence-routes.test.ts`: 최종 PASS, 5 files / 30 tests
- 추가 preflight test 첫 실행: FAIL, offer mapping fixture가 더 이른 canonicalization에서 차단됨. 실제 preflight 차단인 short snapshot id fixture로 수정 후 PASS
- `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS, 최종 테스트 기준 재실행
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-LrNZgh`
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:regress`: PASS, regression 9 cases와 full E2E 10 tests
- `DATABASE_URL=file:./dev.db corepack pnpm test`: PASS, 780 files / 2590 tests
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm build`: PASS, production compile/TypeScript/static generation 250 pages
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --cached --check`: PASS

## Public API / 응답 shape / DB query / cache 영향
- Public URL 변경 없음
- `/api/planning/run`, `/api/planning/v2/run`, `/api/planning/v2/runs` 응답 shape 변경 없음
- profile/scenario/preflight/assumptions error `code/message/status/issues/meta` 변경 없음
- audit `recordId/message`와 호출 순서 변경 없음
- DB schema/Prisma query semantics 변경 없음
- 저장 payload/run index 변경 없음
- cache/revalidation 변경 없음
- persistence/metrics 후속 흐름 변경 없음

## 남은 리스크
- helper는 input preparation phase 전체를 소유하므로 내부 함수별 책임이 다시 섞이지 않도록 후속 변경을 작게 유지해야 합니다.
- #117의 stage pipeline, success response, audit/metrics runtime dependency 경계는 후속 범위입니다.
- PR #136 이후 stacked PR은 최신 main에서 중복과 base 의존성을 다시 확인해야 합니다.
- GitHub Actions billing/spending-limit 차단은 저장소 코드로 자체 해소할 수 없습니다.

## 롤백 기준
- public error shape, audit recordId/message, profile/scenario/assumptions 호출 순서 또는 persistence/metrics 후속 흐름이 달라지면 helper 분리와 테스트를 함께 되돌립니다.
- planning complete/compat/regress, full test 또는 build가 코드 변경으로 실패하면 merge하지 않습니다.

## 다음 작업
- PR #187의 Actions, mergeability와 review thread를 확인합니다.
- 병합 후 PR #134에 superseded 근거를 남기고 close합니다.
- Issue #117에 구현/검증/영향 범위를 기록합니다.
- 다음 후보는 PR #136 success response 경계를 최신 main과 비교합니다.
