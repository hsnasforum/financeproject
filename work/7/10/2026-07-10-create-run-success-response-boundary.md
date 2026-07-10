# 2026-07-10 PR #188 create-run 성공 응답 경계 분리

## 작업 범위

- Issue: https://github.com/hsnasforum/financeproject/issues/117
- Replacement PR: https://github.com/hsnasforum/financeproject/pull/188
- 대체 대상: https://github.com/hsnasforum/financeproject/pull/136
- 기준 main: `00afcfeab907553981473d136b251e93ebe5b84a`
- 구현 커밋: `83d63ef3bc33840192f26dd34415ce108e092b64`

## 변경 이유

`createPlanningRun` 성공 응답 조립을 orchestration 본문에서 분리해 응답 메타 변경이 persistence, audit, metrics 경로에 미치는 범위를 줄였습니다. 기존 public API와 성공 응답 shape는 유지했습니다.

## 변경 파일

- `src/lib/planning/server/runs/createRunService.ts`
- `src/lib/planning/server/runs/createRunSuccessResponse.ts`
- `tests/planning-v2-api/create-run-service-boundary.test.ts`
- `tests/planning-v2-api/create-run-success-response.test.ts`

## 구현 결과

- 성공 결과의 `ok`, `status`, `payload.meta`, `payload.data` 조립을 `buildCreatePlanningRunSuccessResult`로 이동했습니다.
- 성공 meta는 기존 `buildCreatePlanningRunSuccessMeta`를 그대로 사용합니다.
- 입력 run record가 복제되지 않고 `payload.data`로 그대로 전달되는 참조 동일성을 테스트로 고정했습니다.
- 서비스 경계 테스트가 새 helper 파일과 wiring을 확인합니다.

## 계약 영향

- Public URL/API: 변경 없음
- 응답 shape: 변경 없음 (`ok/status/payload.meta/payload.data` 유지)
- DB schema: 변경 없음
- Prisma query semantics: 변경 없음
- run store payload/index/migration/trash/legacy fallback: 변경 없음
- cache/revalidation: 변경 없음
- migration 필요 여부: 없음

## 실행한 검증

- `DATABASE_URL=file:./dev.db corepack pnpm test tests/planning-v2-api/create-run-success-response.test.ts tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/create-run-service-modules.test.ts tests/planning-v2-api/create-run-input-context.test.ts tests/planning-v2-api/create-run-persistence.test.ts tests/planning-v2-api/persistence-routes.test.ts`: PASS, 6 files / 31 tests
- `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:regress`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm test`: PASS
- `corepack pnpm cleanup:next-artifacts && DATABASE_URL=file:./dev.db corepack pnpm build`: PASS, 263.7초
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --cached --check`: PASS

첫 build 시도는 코드 오류 출력 없이 도구의 180초 실행 제한에 도달했습니다. 잔존 build 프로세스가 없음을 확인한 뒤 제한을 10분으로 늘려 같은 명령을 재실행했고 PASS했습니다.

## GitHub Actions 확인

- CI run: https://github.com/hsnasforum/financeproject/actions/runs/29067825071
  - `verify` job `86283063015`: failure, steps 0개
- E2E Smoke run: https://github.com/hsnasforum/financeproject/actions/runs/29067825066
  - `dart_index_missing` job `86283062924`: failure, steps 0개
  - `dart_index_present` job `86283062928`: failure, steps 0개
  - `core_flows` job `86283062929`: failure, steps 0개
- GitHub API의 job step 목록은 모두 비어 있었고 `verify` 로그 조회도 `BlobNotFound`였습니다.
- 판정: workflow code가 한 단계도 실행되지 않은 계정/러너 시작 단계의 외부 실패입니다. 이전 PR에서 확인된 Actions billing/spending-limit 실패와 같은 패턴이며, 현재 API 응답에는 별도 상세 메시지가 노출되지 않았습니다.

## 사용 skill

- `finance-skill-routing`: financeproject 작업에 필요한 로컬 skill 선택
- `planning-gate-selector`: 변경 범위에 맞는 planning 및 최종 검증 선택
- `github:github`: PR, Issue, Actions 상태 확인과 GitHub 작업
- `github:gh-fix-ci`: Actions run, job, step, 로그 실패 범위 확인
- `work-log-closeout`: 한글 closeout 구조와 후속 인계 기록

## 남은 리스크

- create-run stage pipeline과 audit/metrics 런타임 dependency 추가 분리는 후속 PR 범위입니다.
- 서비스부터 route까지 success meta 전체를 한 assertion으로 고정하는 통합 테스트는 없지만, helper exact-shape 테스트와 기존 persistence route/E2E 계약을 유지합니다.

## 롤백 기준

- `/api/planning/run`, `/api/planning/v2/run`, `/api/planning/v2/runs`의 성공 status/meta/data가 달라지거나 기존 planning gate가 회귀하면 PR #188을 되돌립니다.

## 다음 작업

1. PR #188 최종 head에 대한 mergeability를 재확인합니다.
2. PR #188 병합 후 기존 PR #136을 superseded로 정리합니다.
3. Issue #117에 구현 근거와 남은 stage pipeline/audit-metrics dependency 후속 범위를 남깁니다.
4. 최신 main 기준 다음 stacked PR의 고유 변경을 다시 비교합니다.
