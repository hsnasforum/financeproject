# 2026-07-11 Issue #229 owner restore transaction PR-C

## 목표

- PR-B의 encrypted owner archive v1을 변경하지 않고 strict 검증 payload를 same-volume staging으로 전달합니다.
- 실제 restore apply는 계속 차단하고 `os.tmpdir()` 아래 fixture에서만 commit, rollback, pending recovery를 검증합니다.
- commit 중 실패와 rollback 중 2차 실패에서도 original owner checksum과 복구 evidence를 보존합니다.

## 변경 파일

- `src/lib/ops/backup/planningOwnerArchive.ts`
- `src/lib/ops/backup/planningOwnerRestoreTransaction.ts`
- `planning/v3/ops/ownerArchive.test.ts`
- `planning/v3/ops/ownerRestoreTransaction.test.ts`
- `docs/planning-owner-backup-contract.md`
- `OPERATIONS_GUIDE.md`
- `work/7/11/2026-07-11-issue-229-owner-restore-transaction.md`

## 핵심 변경

1. strict archive 검증 결과를 callback 범위에서 전달하고 callback 종료 후 ZIP·payload buffer를 zeroize합니다.
2. `ownerId + physical location` 단위로 target의 nearest existing ancestor 아래에 same-device stage와 backup workspace를 만듭니다.
3. `0600` versioned journal과 lock의 immutable `planDigest`를 교차 확인해 checksum-valid target·anchor 변조를 거부합니다.
4. file은 hard-link no-clobber, directory는 same-volume rename으로 게시하고 backup checksum을 게시 직후와 정리 전에 재검증합니다.
5. 일반 injected failure는 destructive rollback 전 target·backup을 검증하고 전체 location을 역순 rollback합니다.
6. simulated crash와 rollback-incomplete는 evidence를 보존하며 registry/path를 다시 검증한 pending recovery로 수렴합니다.

## 영향 계약

- public API·HTTP 응답 shape: 변경 없음
- CLI: 변경 없음, `--apply`는 archive·secret read 전에 `V3_RESTORE_APPLY_DISABLED`
- internal API: validated payload callback과 fixture-only prepare/commit/rollback/recovery 추가
- stored owner data·archive format: schema/format 변경 없음
- 운영 artifact: fixture transaction 동안 owner-external journal, lock, stage, backup 생성 후 정상 종료 시 정리
- DB query·cache·revalidation·migration: 변경 없음

## 사용 skill

- `finance-skill-routing`: 저장소 전용 최소 skill 범위 선택
- `planning-gate-selector`: route/UI 비변경 PR-C 검증 gate 선택
- `work-log-closeout`: 이번 라운드 인계 기록 형식
- `github:github`: Issue/PR 중복 및 상태 확인
- `github:yeet`: stacked draft PR 게시 절차
- `github:gh-fix-ci`: 원격 Actions 실패가 코드 실행 전 인프라 실패인지 확인

## 실행한 검증

- `corepack pnpm exec vitest run planning/v3/ops/ownerRestoreTransaction.test.ts` — PASS, 1 file / 22 tests
- `corepack pnpm exec vitest run planning/v3/ops/ownerContract.test.ts planning/v3/ops/ownerArchive.test.ts planning/v3/ops/ownerRestoreTransaction.test.ts planning/v3/ops/restore.test.ts` — PASS, 4 files / 56 tests
- `corepack pnpm typecheck:planning:v3` — PASS
- `corepack pnpm lint` — PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test` — PASS, 807 files / 2,764 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm exec vitest run tests/planning/auth/postgresReadinessScript.test.ts` — PASS, 1 file / 15 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm verify` — PASS, 807 files / 2,764 tests; ESLint, TypeScript, security·route scan 포함
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build` — PASS, Next.js production build와 250 static page 생성 완료
- `corepack pnpm planning:v2:compat` — PASS, 내부 `planning:v2:complete`, compatibility fixture와 fast E2E 포함
- `corepack pnpm planning:v2:ops:safety` — PASS
- `corepack pnpm planning:auth:check` — PASS, 13 files / 75 tests
- `corepack pnpm planning:user-scope:check` — PASS, 15 files / 88 tests
- `corepack pnpm multi-agent:guard` — PASS
- `git diff --check` — PASS

clean worktree에서 `DATABASE_URL` 없이 readiness 테스트를 실행하면 기존 Prisma config 계약 때문에 4건이 실패합니다. PR-B에서도 동일 재현되고 관련 파일은 PR-C에서 변경하지 않았습니다. non-secret SQLite fixture URL을 명령 환경으로 명시하면 15/15 통과하며, 저장소 전체 clean-worktree 기본값 문제는 별도 P2입니다.

## 고정된 fixture 의미론

- directory location에 payload가 없으면 빈 directory를 desired state로 봅니다.
- file location에 payload가 없으면 absent file을 desired state로 봅니다.
- 모든 target은 `os.tmpdir()` 아래 명시적 fixture boundary 내부여야 합니다.
- native Windows와 fixture 밖 target은 fail-closed입니다.
- journal 없이 lock만 남으면 partial commit 가능성을 배제할 수 없어 자동 삭제하지 않고 evidence를 보존합니다.

## 남은 리스크

- owner별 payload semantic schema validator와 registry 전체 doctor는 PR-D 범위입니다.
- 같은 Node 프로세스의 동일 journal 동시 호출은 차단하지만 실제 앱 writer와 다른 프로세스를 멈추는 offline/quiesced cross-process lock은 아직 없습니다.
- native Windows junction/reparse point, ACL, rename/open-handle 동작은 검증하지 않았습니다.
- runtime-shared owner를 사용자 archive와 함께 교체하는 제품 정책이 확정되지 않았습니다.
- 위 조건이 남아 있으므로 production apply 차단을 해제하지 않습니다.

## 롤백 기준

- PR-C는 production 경로와 연결되지 않았으므로 문제가 확인되면 PR-C commit을 revert하고 PR-B의 strict preview까지만 유지합니다.
- transaction fixture에서 original checksum 불변, backup 검증, no-clobber, journal/lock `planDigest` 중 하나라도 회귀하면 PR-D로 진행하지 않고 apply 차단을 유지합니다.
- rollback-incomplete evidence가 소실되거나 fixture boundary 밖 경로가 쓰이면 즉시 사용을 중단하고 해당 artifact를 수동 삭제하지 않은 채 원인 분석 대상으로 보존합니다.

## 다음 라운드 우선순위

1. PR-D에서 17개 owner의 semantic schema와 registry 전체 doctor 진단을 구현합니다.
2. cross-process lock과 실제 writer drain/offline 절차, orphan lock 판정·정리 정책을 결정하고 fixture로 검증합니다.
3. native Windows junction/reparse point, ACL, rename/open-handle 동작이 검증되기 전에는 제한적 apply도 활성화하지 않습니다.
