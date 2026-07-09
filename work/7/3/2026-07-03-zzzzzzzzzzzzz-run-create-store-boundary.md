# 2026-07-03 run create store boundary

## 작업 Issue / PR
- Issue: #116 planning run store retention/index/fallback 경계 분리 후속
- Base: PR #147 head 위 stacked 후속 브랜치 `codex/116-run-create-store-boundary`
- PR: 생성 전

## 변경 파일
- `src/lib/planning/store/runCreateStore.ts`
- `src/lib/planning/store/runMetaWriter.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runCreateStore.test.ts`
- `tests/planning/runMetaWriter.test.ts`
- `work/7/3/2026-07-03-zzzzzzzzzzzzz-run-create-store-boundary.md`

## 사용 skill
- finance-skill-routing: PR #127 이후 후속 구조 개선 범위와 조건부 skill 판단
- planning-gate-selector: planning run store core 변경에 필요한 검증 세트 선정
- work-log-closeout: 종료 기록 필수 항목과 형식 반영
- github:github: PR #127/#147, 관련 Issue 상태 확인
- manager subagent: #116/#117 후속 중 다음 작은 PR 후보 재분해 참고

## 변경 이유
- #116 잔여 리스크 중 `runStore.ts`가 run create의 blob write, meta write, index upsert, retention, rollback transaction orchestration을 함께 소유하고 있었다.
- 이전 라운드에서 read/meta 경계는 분리됐지만 create/update write 경계가 남아 있어 corruption/rollback 회귀를 좁은 단위로 테스트하기 어려웠다.
- public run store API는 유지하고, 파일 저장 orchestration만 주입 가능한 helper로 옮겨 영향 범위를 줄였다.

## 핵심 변경
- `runCreateStore.ts`를 추가해 run create의 storage transaction, stage blob write, meta write, index upsert, retention hook, rollback cleanup을 담당하게 했다.
- `runMetaWriter.ts`를 추가해 create/update가 같은 canonical meta write helper를 공유하도록 했다.
- `runStore.ts`는 기존 public 함수명과 input/output shape를 유지하고, startup migration, id/profile normalization, index store/retention wiring만 소유하도록 축소했다.
- `runCreateStore.test.ts`로 성공 시 blob/meta/index/retention 호출과 실패 시 rollback cleanup/index remove를 고정했다.
- `runMetaWriter.test.ts`로 update path에서 공유되는 canonical meta write를 독립 검증했다.

## 검증
- `corepack pnpm test tests/planning/runCreateStore.test.ts tests/planning/runMetaWriter.test.ts tests/planning/runMetaReader.test.ts tests/planning/runBlobStore.test.ts tests/planning/runMetaRecord.test.ts tests/planning-store.test.ts`: PASS, 6 files / 27 tests
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: FAIL, `tests/planning/auth/postgresReadinessScript.test.ts` 4건. 원인: `DATABASE_URL` 미설정으로 Prisma PostgreSQL schema validate/diff가 `Cannot resolve environment variable: DATABASE_URL`를 반환.
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 769 files / 2542 tests
- `corepack pnpm planning:v2:complete`: PASS, fast e2e 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-J1ZOeT`
- `corepack pnpm planning:v2:regress`: PASS, regression 9 cases + full e2e 10 tests
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS, 문서 추가 전 기준 최신 note는 이전 라운드 문서

## Public API / DB / Cache 영향
- Public URL 변경 없음.
- Public API 함수명과 route 응답 shape 변경 없음.
- 저장 payload schema, run index entry shape, stage blob ref shape 변경 없음.
- DB schema, Prisma query semantics 변경 없음.
- cache/revalidation 동작 변경 없음.

## 남은 리스크
- #116의 startup migration ownership, trash/legacy fallback 전체 재작성은 아직 남아 있다.
- create orchestration은 helper로 분리했지만 `runStore.ts`가 여전히 startup migration과 legacy backfill orchestration의 public entry point다.
- `planning:v2:compat --keep-sandbox`의 `/planning/runs` 로그에서는 read/create helper가 새 병목으로 보이지 않았고, default profile/profile list/startup path 계측이 다음 후보로 남아 있다.
- 이 PR은 PR #147 위 stacked PR이므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요하다.

## 롤백 기준
- run create 후 meta/blob/index/retention 동작이 기존 테스트와 다르게 깨지거나 rollback cleanup이 누락되면 `runCreateStore.ts` 도입 전의 `runStore.ts` inline orchestration으로 되돌린다.
- public route 응답 shape, stored run payload, blob ref path, index ordering 차이가 발견되면 이번 helper 분리만 롤백한다.

## 다음 라운드 우선순위
- #116: startup migration ownership과 profile/run list slow-path 원인을 telemetry로 확인한다.
- #116: trash/legacy fallback 경계를 전체 재작성하지 않고 더 작은 read/delete/migration helper 단위로 나눌 수 있는지 검토한다.
- #117: open stack 정리 후 persistence adapter와 audit/metrics side-effect 경계 추가 분리를 재평가한다.
