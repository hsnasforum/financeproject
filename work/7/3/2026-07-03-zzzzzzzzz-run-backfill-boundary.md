# 2026-07-03 #116 run legacy backfill boundary closeout

## 사용 skill
- finance-skill-routing: Finance Project 작업 범위와 조건부 skill 판단
- planning-gate-selector: runStore/planning v2 core 변경 검증 세트 선정
- work-log-closeout: 작업 종료 기록 형식 반영
- github:github: PR/Issue stack 상태 확인

## 연결 Issue/PR
- Issue: #116 planning run store 구조 개선 후속
- 기준 PR: #143 (`codex/116-run-index-store-boundary`)
- 이번 브랜치: `codex/116-run-backfill-boundary`
- 새 PR: 생성 예정

## 변경 요약
- `runStore.ts`의 legacy backfill raw meta 읽기와 service dependency 조립을 `createRunLegacyBackfillStore`로 분리했다.
- public wrapper인 `summarizeLegacyRunBackfill`, `listLegacyRunBackfillCandidates`, `backfillLegacyRuns`는 기존 함수명과 응답 shape를 유지하고 새 store로 위임한다.
- raw meta 후보 읽기 순서(`partition meta -> legacy run meta -> legacy file`)를 focused test로 고정했다.
- `pnpm_runner`의 기본 `runPnpm` 실행이 실제 stdio inherit을 쓰도록 고쳐 `planning:v2:compat` nested gate 실패 원인을 볼 수 있게 했다.
- legacy fixture에서 redirect 검증이 한 테스트 timeout에 누적되지 않도록 `planning-v2-fast` redirect e2e를 경로별 테스트로 분리했다.

## 변경 파일
- `src/lib/planning/store/runStore.ts`
- `src/lib/planning/store/runLegacyBackfillStore.ts`
- `tests/planning/runLegacyBackfillStore.test.ts`
- `scripts/pnpm_runner.mjs`
- `tests/e2e/planning-v2-fast.spec.ts`
- `work/7/3/2026-07-03-zzzzzzzzz-run-backfill-boundary.md`

## 검증
- `corepack pnpm test tests/planning/runLegacyBackfillStore.test.ts tests/planning-store.test.ts`: PASS
- `corepack pnpm test tests/pnpm-runner.test.ts tests/planning/runLegacyBackfillStore.test.ts tests/planning-store.test.ts`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS, 764 files / 2531 tests
- `corepack pnpm planning:v2:compat --keep-sandbox`: FAIL 재현 후 원인 확인, 최종 PASS
  - 1차: nested `planning:v2:complete` 실패 원인이 출력되지 않음
  - runner stdio 보강 후: legacy fixture의 redirect e2e 단일 테스트 timeout 확인
  - redirect e2e 분리 후: PASS, sandbox `/tmp/planning-v2-compat-nAolmY`
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:regress`: PASS
- `corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS, staged closeout 기준

## 영향 여부
- Public URL/API 변경: 없음
- 응답 shape 변경: 없음
- DB schema/Prisma query 변경: 없음
- cache/revalidation 동작 변경: 없음
- planning run legacy backfill 내부 읽기/후보 판정 경계만 분리했으며, 기존 public wrapper는 유지했다.
- e2e 테스트 파일은 검증 granularity만 변경했다.

## 남은 리스크
- #116의 migration/trash/legacy fallback 전체 재작성은 여전히 후속 범위다.
- legacy fixture에서 `/planning/runs`와 일부 초기 페이지 로드가 30초 이상 걸리는 경우가 있어, 테스트 분리로 false timeout은 줄였지만 성능 원인 분석은 별도 후속이 필요하다.
- #117 persistence adapter 추가 분리는 이번 범위에서 제외했다.

## 롤백 기준
- legacy backfill summary/list/backfill 후보 수가 기존과 달라지거나 ops backfill script가 regress하면 `runLegacyBackfillStore` 위임을 되돌리고 기존 `runStore.ts` 내부 raw meta helper로 복구한다.
- `planning:v2:compat` 또는 e2e runner에서 stdio 동작 문제가 재발하면 `pnpm_runner`의 inherit 기본값 변경을 별도 PR로 분리 검토한다.
- redirect e2e 분리로 CI 시간이 비정상 증가하면 해당 테스트만 기존 구조로 되돌리되 timeout 누적 문제를 별도 해결한다.

## 다음 라운드 우선순위
- #116: trash/migration/fallback 관측성 경계 추가 분리
- #116: legacy fixture slow path 원인 분석(`/planning/runs`, profile list, startup migration 반복 여부)
- #117: create run persistence adapter와 audit/metrics side-effect 경계 추가 분리
