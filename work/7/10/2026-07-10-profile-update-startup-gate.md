# 2026-07-10 profile update startup migration gate 단일화

## 변경 파일

- `src/lib/planning/store/profileStore.ts`
- `tests/planning/profileStoreStartupGate.test.ts`
- `work/7/10/2026-07-10-profile-update-startup-gate.md`

## 사용 skill

- `finance-skill-routing`: planning 구조 개선 라운드의 기본 skill 조합 확인
- `planning-gate-selector`: profile store 변경에 필요한 focused, compatibility, regress, build 검증 선택
- `github:github`: Issue #194 상태 확인과 후속 PR 게시·CI 확인에 사용
- `work-log-closeout`: 변경 계약, 검증 결과, 남은 리스크를 한글 closeout으로 기록
- `manager` subagent: #194와 FINLIFE 후속 범위를 비교하고 #194를 이번 라운드 최소 변경으로 선정
- `reviewer` subagent: startup gate, legacy migration, namespace/default 동기화의 회귀 위험 검토

## 변경 이유

- Issue https://github.com/hsnasforum/financeproject/issues/194 의 현재 코드 재검증 결과, `updateProfile`이 startup migration gate를 실행한 뒤 public `getProfile`을 호출해 같은 요청에서 gate 관측 sequence가 두 번 증가했습니다.
- public `getProfile`의 server-only 및 startup migration 보장은 유지하면서, 이미 gate를 통과한 내부 update read만 중복 호출을 피할 필요가 있었습니다.
- legacy profile fallback/migration, namespace별 경로, default profile registry 동기화와 저장 형식은 바꾸지 않는 범위로 제한했습니다.

## 핵심 변경

- startup migration 이후에만 호출하는 private `readProfileRecordAfterStartupMigrations` helper로 기존 profile read/fallback 본문을 추출했습니다.
- public `getProfile`은 기존과 동일하게 `assertServerOnly`와 `ensureStartupMigrations`를 실행한 뒤 private helper를 호출합니다.
- `updateProfile`은 자체 startup gate를 한 번 실행한 뒤 private helper를 사용해 동일 요청의 두 번째 gate를 제거했습니다.
- 존재/부재 update, legacy-only profile migration과 default sync, 사용자 namespace 격리를 4개 회귀 테스트로 고정했습니다.
- reviewer가 제기한 legacy migration 및 namespace/default update-specific 테스트 공백은 최종 테스트에 반영했습니다.

## 검증

- focused Vitest 7 files: PASS, 44 tests
- `corepack pnpm lint`: PASS, 91.5초
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, compat 8 tests 및 nested `planning:v2:complete` fast E2E 8건 포함, 91.9초
- 최초 `corepack pnpm test`: FAIL, clean worktree에 ignored `.env`가 없어 `DATABASE_URL` 미설정으로 PostgreSQL readiness 4건만 실패
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm exec vitest run tests/planning/auth/postgresReadinessScript.test.ts --reporter=verbose`: PASS, 15 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 77.9초
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 229.1초
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:v2:regress`: PASS, regression 9 cases 및 full E2E 10건, 111.9초
- reviewer: 기능 finding 없음. Low 테스트 공백 2건은 보강 후 focused/full suite에서 PASS
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS, closeout 작성 전·후 확인
- 미실행: 수동 `docs/planning-v2-5min-selftest.md`, production 배포 smoke, `corepack pnpm release:verify`

## 계약 영향

- Public URL/API/HTTP 응답 shape 변경 없음.
- DB schema, Prisma query 및 query semantics 변경 없음.
- HTTP cache/revalidation 및 애플리케이션 cache 동작 변경 없음.
- profile JSON 저장 형식, namespace 경로, legacy migration/cleanup, default registry 동기화 변경 없음.
- 내부 관측값은 의도적으로 달라집니다. `updateProfile` 한 번의 startup migration gate sequence가 2에서 1로 줄어듭니다.

## 남은 리스크

- private helper는 startup gate를 자체 보장하지 않으므로 `profileStore.ts` 내부에서만 사용해야 합니다. 현재 export하지 않았고 호출 지점은 gate 직후로 제한했습니다.
- 이번 변경은 profile update 경로만 다루며 runStore migration/trash/legacy fallback 전체 재작성이나 FINLIFE freshness 정렬은 포함하지 않습니다.
- GitHub Actions는 최근 계정 billing/spending 제한으로 job step이 시작되지 않는 상태가 반복되어, PR 생성 후에도 local PASS와 Actions `steps: []`를 분리해 기록해야 합니다.
- 롤백 기준은 public `getProfile` gate 누락, update gate sequence가 1이 아닌 경우, legacy cleanup/default sync/namespace 격리 회귀, 저장 형식 또는 public/DB/cache 계약 변화입니다.

## 다음 라운드

1. Issue #194 연결 PR을 게시하고 최종 head의 리뷰, merge conflict, Actions job step 실행 여부를 확인합니다.
2. local 검증과 최종 tree가 유지되면 PR을 병합하고 Issue #194를 완료 처리합니다.
3. 다음 구조 개선 후보는 Issue #197 FINLIFE snapshot·DB sync freshness 계약을 현재 `main`에서 다시 좁혀 작은 PR 단위로 설계합니다.
