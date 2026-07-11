# 2026-07-11 Issue #229 owner doctor·apply 차단 PR-D

## 변경 파일

- `src/lib/ops/backup/planningOwnerDoctor.ts`
- `src/lib/ops/backup/planningOwnerArchive.ts`
- `src/lib/ops/backup/zipCodec.ts`
- `src/lib/planning/v3/ops/doctor.ts`
- `src/lib/planning/v3/ops/restore.ts`
- `planning/v3/ops/ownerDoctor.test.ts`
- `planning/v3/ops/ownerArchive.test.ts`
- `planning/v3/ops/doctor.test.ts`
- `planning/v3/ops/restore.test.ts`
- `docs/planning-owner-backup-contract.md`
- `OPERATIONS_GUIDE.md`
- `work/7/11/2026-07-11-issue-229-owner-doctor.md`

## 사용 skill

- `finance-skill-routing`: Issue #229 PR-D에 필요한 최소 local skill 조합 선택
- `planning-gate-selector`: 내부 owner doctor·restore safety 변경에 맞는 focused/full gate 선택
- `work-log-closeout`: 변경·검증·잔여 위험을 `/work` 인수인계 형식으로 기록
- `github:github`: Issue #229와 stacked PR 상태·중복 범위 확인
- `github:yeet`: 명시 파일만 commit·push하고 stacked draft PR을 게시하는 절차 적용
- `github:gh-fix-ci`: 원격 Actions 실패 시 step·로그 존재 여부를 확인해 코드 실패와 인프라 실패를 분리

## 변경 이유

기존 `v3:doctor`는 `cwd/.data` 아래 news, indicators, alerts, journal 일부만 검사해 17-owner registry, `PLANNING_DATA_DIR`, packaged vault, namespace와 stable/v3 owner completeness를 증명하지 못했습니다. PR-D는 동일 registry를 사용하는 read-only doctor를 추가하고, common guard 뒤에 남아 있던 legacy 전체 `.data` apply 구현을 삭제합니다. production apply는 활성화하지 않습니다.

## 핵심 변경

1. doctor summary와 validator key를 17-owner registry exact-set으로 고정하고 canonical owner contract와 registry order를 파일 read 전에 검증합니다.
2. no-follow walker, bounded directory enumeration, exact-size read와 size budget으로 owner 경계만 읽고 semantic schema, symlink, special file, hard-link alias, escape, concurrent growth, namespace drift를 typed error로 보고합니다.
3. missing/empty active owner는 `emptyAllowed` 계약에 따라 허용하고 archive `requiredInManifest`와 구분합니다.
4. runtime-key encrypted stable payload는 key 없이 성공으로 단정하지 않고 `unverified` error로 분리합니다.
5. legacy whole-`.data` rename/write/rollback 코드를 제거하고 legacy·owner `--apply` 조기 차단을 유지합니다.
6. encrypt/decrypt/ZIP의 초기 실패·성공·인증 실패 경로에서 소유한 plaintext와 파생 키를 zeroize하고 caller 입력·성공 반환 buffer는 보존합니다.

## 영향 계약

- public HTTP API: 변경 없음
- HTTP 응답 shape: 변경 없음
- internal CLI/library report: `ok/checkedAt/counts/summaries/issues` 상위 shape 유지. summary key는 기존 partial check에서 17 owner ID로 바뀌고 missing/empty location count가 추가됨
- support bundle·migration post-check: stored format 변경은 없지만 doctor summary의 진단 의미가 17 owner 기준으로 변경됨
- stored data: 변경 없음. doctor는 read-only이며 생성·rewrite·migration·repair를 하지 않음
- archive/manifest format: 변경 없음
- DB query·cache·revalidation: 변경 없음
- migration: 데이터·format 변경 없음. post-migration doctor 판정 범위는 17 owner로 확대
- restore: legacy destructive implementation 삭제, 모든 production apply 차단 유지

## 실행한 검증

- `corepack pnpm exec vitest run planning/v3/ops/ownerContract.test.ts planning/v3/ops/ownerDoctor.test.ts planning/v3/ops/doctor.test.ts planning/v3/ops/ownerArchive.test.ts planning/v3/ops/ownerRestoreTransaction.test.ts planning/v3/ops/restore.test.ts planning/v3/ops/supportBundle.test.ts planning/v3/ops/migrate.test.ts tests/planning/migrations/compat-fixtures.test.ts` — PASS, 9 files / 90 tests
- `corepack pnpm typecheck:planning:v3` — PASS
- `corepack pnpm typecheck` — PASS
- `corepack pnpm lint` — PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test` — PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm verify` — PASS. 생성된 freshness/schema/DART 보고서는 검증 뒤 기준 상태로 복원
- `corepack pnpm planning:v2:complete` — PASS, fast E2E 8/8 포함
- `corepack pnpm planning:v2:compat` — PASS, legacy migration fixture와 fast E2E 8/8 포함
- `corepack pnpm planning:v2:ops:safety` — PASS, 격리 worktree의 fixture root만 사용
- `corepack pnpm planning:auth:check` — PASS, 13 files / 75 tests
- `corepack pnpm planning:user-scope:check` — PASS, 15 files / 88 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build` — PASS, 250 pages
- `corepack pnpm multi-agent:guard` — PASS, tracked=23 / coverage=16. 같은 날짜 파일명 정렬상 latestWorkNote 표시는 PR-C 기록을 유지하지만 PR-D 기록도 명시 stage에 포함
- `git diff --check f4c1c658913e3c736ebb029a11fde40fc70cd530 --` — PASS
- 독립 read-only 보안·호환성 재검토 2회 — 남은 P0/P1 없음

첫 full test에서 ZIP stream chunk가 caller ZIP buffer와 alias되어 preview 뒤 동일 fixture 재사용 시 `MANIFEST_INVALID_JSON`이 발생했습니다. stream chunk를 소유 복사한 뒤 자체 buffer만 zeroize하도록 수정하고, caller `Buffer`/`Uint8Array` 불변 회귀 테스트를 추가한 뒤 full test와 verify를 재통과했습니다.

## 이번 라운드 완료 항목

- [완료] 17-owner read-only doctor와 validator exact-set
- [완료] stable profile/run·v3 draft·override semantic corruption fail-closed
- [완료] symlink·special file·owner 밖 hard-link·resource budget·concurrent growth 차단
- [완료] legacy whole-`.data` apply 구현 제거와 조기 차단 회귀 테스트
- [완료] archive/ZIP/KDF failure-path zeroization과 caller buffer 소유권 보존
- [완료] 운영·계약 문서와 local full gate

## 남은 리스크

- actual app writer drain과 offline/quiesced cross-process lock이 없습니다.
- journal 없는 lock의 pre-journal crash와 journal 유실 뒤 partial commit을 자동 구분할 수 없어 삭제하지 않습니다.
- runtime-shared indicators·legacy transactions를 사용자 restore와 함께 교체할 제품 정책이 없습니다.
- native Windows junction/reparse point, ACL, hard-link, rename/open-handle 동작을 검증하지 않았습니다.
- 동일 권한 공격자가 directory를 교체한 뒤 사후 fingerprint 전에 원복하는 swap-back 경쟁은 path 기반 read-only doctor만으로 완전히 증명하지 못합니다.
- stable run blob과 news search-index는 실제 writer가 허용하는 JSON record 수준까지만 검사합니다. 새로운 세부 contract가 생기면 validator를 함께 좁혀야 합니다.
- stable runtime-key payload의 portable backup 또는 runtime-key DR snapshot 정책이 없습니다.
- file store와 Prisma DB를 동일 시점 snapshot으로 묶을지 결정되지 않았습니다.
- 위 조건 때문에 production apply 차단을 유지합니다.

## 롤백 기준

- doctor가 owner 밖 path를 읽거나 데이터를 생성·수정하면 PR-D를 revert하고 기존 partial doctor로 복귀합니다.
- fresh empty owner가 corruption으로 판정되거나 namespace mismatch 전에 supplied path를 읽으면 doctor 연결을 중단합니다.
- legacy `--apply`가 archive read 전 차단되지 않거나 `.data` backup/rename 코드가 다시 생기면 즉시 배포를 중단합니다.
- archive format·stored schema·public API가 예상과 달리 변하면 PR-D를 분리·재검토합니다.
- doctor summary key 변경이 기존 support bundle consumer와 호환되지 않으면 doctor 연결을 되돌리고 별도 format-version 정책을 먼저 합의합니다.

## 다음 라운드 우선순위

1. apply 활성화는 Issue #229 밖의 product·ops·security 결정과 single-writer/at-rest·DB lifecycle Issue가 정리될 때까지 보류합니다.
2. 데이터 무결성 Wave 1의 다음 항목인 Issue #230 v3 JSON store corruption/lost-update 제거를 현재 main에서 재확인합니다.
3. GitHub Actions runner가 정상화되면 stacked PR의 required check를 재실행합니다.
