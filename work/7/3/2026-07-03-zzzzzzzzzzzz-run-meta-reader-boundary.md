# 2026-07-03 run meta reader boundary

## 변경 파일
- `src/lib/planning/store/runMetaReader.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runMetaReader.test.ts`
- `work/7/3/2026-07-03-run-meta-reader-boundary.md`

## 사용 skill
- finance-skill-routing: PR #127 이후 후속 구조 개선 범위와 조건부 skill 판단
- planning-gate-selector: planning run read/migration helper 변경에 필요한 검증 세트 선정
- work-log-closeout: 작업 종료 기록 형식과 필수 항목 반영
- github:github: PR #127/#145/#146, 관련 Issue/PR 상태 확인
- manager subagent: #116/#117 후속 중 충돌이 적은 다음 축 재분해

## 변경 이유
- #116 잔여 리스크 중 `runStore.ts`의 run meta file read/decode/canonicalization/migration persistence 판단이 orchestration 파일에 남아 있어 corruption/migration 회귀를 좁은 단위로 검증하기 어려웠다.
- PR #146 이후에도 `#117` stack은 이미 여러 PR이 열려 있어, 이번 라운드는 겹침이 적은 `#116` read wrapper 경계 축으로 제한했다.
- public run store wrapper와 fallback source order는 유지하면서, 파일 읽기 결과 분류와 migration persistence 조건만 helper로 분리했다.

## 핵심 변경
- `runMetaReader.ts`를 추가해 run meta 파일의 missing/invalid/decode/invalid-record/canonicalization 결과 분류를 담당하게 했다.
- 기존 `recordRunReadFallbackUsage`, engine envelope migration, `persistMigrations === true` 저장 조건은 새 helper 안에서 그대로 유지했다.
- `runStore.ts`는 read source 후보 순회, legacy-to-partition migration orchestration, diagnostics recording을 계속 소유한다.
- `runMetaReader.test.ts`로 missing/invalid JSON 분류와 migration persistence opt-in 동작을 고정했다.
- Public wrapper 함수명, 반환 shape, 저장 payload schema, fallback metric source string은 바꾸지 않았다.

## 검증
- `corepack pnpm test tests/planning/runMetaReader.test.ts tests/planning/runMetaRecord.test.ts tests/planning-store.test.ts`: PASS, 3 files / 22 tests
- `corepack pnpm lint`: PASS
- `git diff --check`: PASS
- `DATABASE_URL="postgresql://finance_user:local-only@127.0.0.1:1/finance_test?schema=public" corepack pnpm test`: PASS, 767 files / 2539 tests
- `corepack pnpm planning:v2:complete`: PASS, fast e2e 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-hshVOT`
- `corepack pnpm planning:v2:regress`: PASS, regression 9 cases + full e2e 10 tests
- `corepack pnpm build`: PASS

## 남은 리스크
- Public URL/API, 응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작 변경은 없다.
- #116의 startup migration ownership, create/update write orchestration, migration/trash/legacy fallback 전체 재작성은 아직 남아 있다.
- `/planning/runs` slow-path 직접 원인은 telemetry 수집 전이라 아직 확정하지 않았다.
- 이 변경은 PR #146 위 stacked PR로 올리는 범위라 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요할 수 있다.

## 다음 라운드 우선순위
- #116: startup migration ownership과 profile/run list slow-path 원인을 telemetry로 확인한다.
- #116: create/update write orchestration을 단일 helper 축으로 추가 분리할지 현재 stack 기준으로 재평가한다.
- #117: PR #133~#139 stack 정리 후 persistence/audit/metrics 잔여 경계를 다시 본다.
