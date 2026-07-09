# 2026-07-03 #116 run meta boundary closeout

## 사용 skill
- finance-skill-routing: Finance Project 작업 범위와 조건부 skill 판단
- planning-gate-selector: planning run store/v2 core 변경 검증 세트 선정
- work-log-closeout: 작업 종료 기록 형식 반영
- github:github: PR/Issue/stack 상태 확인
- manager subagent: #116/#117 후속 stack과 다음 작은 범위 재분해

## 연결 Issue/PR
- Issue: #116 planning run store 구조 개선 후속
- 기준 PR: #144 (`codex/116-run-backfill-boundary`)
- 이번 브랜치: `codex/116-run-meta-boundary`
- 새 PR: #145 https://github.com/hsnasforum/financeproject/pull/145

## 변경 요약
- `runStore.ts`에 남아 있던 run meta compact/normalization, read canonicalization, create-run record assembly를 `runMetaRecord.ts` helper로 분리했다.
- `runStore.ts`는 기존 public wrapper와 transaction/blob write/index upsert/retention orchestration을 유지한다.
- create-run 저장 meta의 resultDto light payload, blob ref 부착, stage outputRef ref 부착 계약을 focused test로 고정했다.
- read 시 missing resultDto rebuild source와 raw-output compact 계약을 helper 단위에서 검증했다.

## 변경 파일
- `src/lib/planning/store/runStore.ts`
- `src/lib/planning/store/runMetaRecord.ts`
- `tests/planning/runMetaRecord.test.ts`
- `work/7/3/2026-07-03-zzzzzzzzzz-run-meta-boundary.md`

## 검증
- `corepack pnpm test tests/planning/runMetaRecord.test.ts tests/planning-store.test.ts`: PASS, 20 tests
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS, 765 files / 2534 tests
- `corepack pnpm planning:v2:complete`: PASS, fast e2e 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-XXy0Qh`
- `corepack pnpm planning:v2:regress`: PASS, regression 9 cases + full e2e 10 tests
- `corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS, closeout 작성 전 기준

## 영향 여부
- Public URL/API 변경: 없음
- 응답 shape 변경: 없음
- DB schema/Prisma query 변경: 없음
- cache/revalidation 동작 변경: 없음
- run JSON 저장 payload schema와 index payload version/entries shape 변경 없음
- migration/trash/backfill 실행 의미 변경 없음

## 남은 리스크
- #116의 legacy fixture slow path는 재확인됐다. `planning:v2:compat --keep-sandbox`에서 `/planning/runs`가 약 27.8초 소요됐다.
- runStore에는 여전히 startup migration trigger, read wrapper, file write orchestration이 남아 있다. 다만 이번 PR에서 동시에 분리하지 않았다.
- #117 잔여 범위는 별도 PR stack(#133~#139) 정리 이후 재평가하는 편이 안전하다.

## 롤백 기준
- create-run 저장 meta에서 `ok/status/meta/data` 응답이나 run detail blob ref 표시가 달라지면 `runMetaRecord.ts` 위임을 되돌리고 기존 `runStore.ts` 내부 조립으로 복구한다.
- legacy run read에서 resultDto rebuild, debt raw backfill, engine envelope migration counter가 달라지면 `normalizeRunMetaForRead` 이동을 되돌린다.
- compat fixture의 legacy read/backfill 후보 수가 바뀌면 이번 helper 분리를 되돌리고 #116 후속을 더 작은 read-only 범위로 재분리한다.

## 다음 라운드 우선순위
- #116: legacy fixture slow path 원인 분석(`/planning/runs`, profile list, startup migration 반복 여부)
- #116: startup migration trigger/read wrapper 경계 추가 분리 여부 검토
- #117: 기존 #133~#139 stack 상태 정리 후 잔여 persistence/wiring 범위 재평가
