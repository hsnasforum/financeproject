# 2026-07-11 Issue #229 owner registry·manifest 계약

## 변경 파일

- `src/lib/ops/backup/planningOwnerRegistry.ts`
- `src/lib/ops/backup/planningOwnerManifest.ts`
- `planning/v3/ops/ownerContract.test.ts`
- `docs/planning-owner-backup-contract.md`
- `work/7/11/2026-07-11-issue-229-owner-contract.md`

## 사용 skill

- `finance-skill-routing`: Finance Project에 필요한 최소 skill 조합 선택
- `planning-gate-selector`: 내부 계약 변경에 맞는 focused·전체 검증 gate 선택
- `work-log-closeout`: 변경·검증·잔여 위험을 `/work` 형식으로 기록
- `github:github`: 기존 Issue·PR과 선행 PR 상태 확인
- `github:yeet`: 명시 파일만 커밋·push하고 stacked draft PR을 게시하는 절차 확인
- `github:gh-fix-ci`: PR #251의 실패 job step·로그를 확인하고 코드 실패와 Actions 선행 실패를 분리

## 변경 이유

Issue #229의 첫 단계로, 현재 cwd 고정 export/restore가 놓치는 실제 Planning 저장 경로를 owner 단위로 식별하고 향후 archive writer·preview·transaction이 공유할 fail-closed manifest 계약을 먼저 고정했습니다. 선행 PR #250의 `V3_RESTORE_APPLY_DISABLED` 차단은 그대로 유지하며 실제 사용자 데이터에 restore apply를 실행하지 않았습니다.

## 핵심 변경

1. 주입된 `cwd`, `env`, `platform`, 명시 사용자로 immutable runtime context를 만들고 17개 owner의 canonical·legacy 위치를 resolve합니다.
2. owner ID·logical path·물리 target 충돌, filesystem root, namespace 무명 사용자, drafts override schema 충돌을 fail-closed로 거부합니다.
3. `planning-owner-vault` manifest v1에 정확한 scope, owner completeness, namespace, file/owner checksum, portable path와 owner 귀속 계약을 정의합니다.
4. default·packaged·namespace·override·Linux case 경계와 strict manifest 오류를 21개 focused test 및 전체 location matrix로 고정합니다.
5. symlink·junction·reparse point는 PR-B의 `lstat`·`realpath` 중단 조건으로 문서화하고, 암호화 정책 결정 전 writer 운영 기본값과 apply 활성화를 금지합니다.

## 영향 범위

- public API: 없음
- 응답 shape: 없음
- stored data: 없음. 아직 사용되지 않는 내부 manifest schema/parser만 추가했습니다.
- DB query: 없음
- cache/revalidation: 없음
- migration: 없음. format v1 writer와 기존 archive migration은 후속 PR 범위입니다.

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run planning/v3/ops/ownerContract.test.ts --reporter=dot`: PASS, 1 file / 21 tests
- 관련 dataDir·namespace·backup 회귀 5개 파일: PASS, 58 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm typecheck`: PASS
- 대상 파일 ESLint와 `git diff --check`: PASS
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, exit 0
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:v2:compat`: PASS, compat fixture 8 tests와 fast E2E 8 tests 포함
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:v2:ops:safety`: PASS, fixture 기반 ops run·legacy backfill
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:auth:check`: PASS, 75 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:user-scope:check`: PASS, 88 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm verify`: PASS, exit 0. 현재 snapshot 8개 stale 및 `rules_eval.json` 부재에 따른 DART rules gate SKIP은 기존 외부 데이터 상태로 별도 기록하며 자동 생성 보고서 변경은 원복했습니다.
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 351.2초
- 독립 read-only 재검토: P0/P1 잔존 finding 없음
- PR #251 원격 CI: push·pull_request의 5개 job 모두 `steps=[]`, 로그 미생성으로 Actions 계층 선행 실패. 로컬 코드 수정 근거 없음
- 실제 사용자 데이터 restore apply: 실행하지 않음

## 남은 리스크

- `[제품·보안 결정 필요]` portable passphrase 암호화 backup과 동일 runtime key 전용 DR snapshot 중 제품 형식을 확정해야 합니다.
- `[운영 결정 필요]` `active-namespace-and-runtime-shared` archive는 다른 사용자 namespace를 포함하지 않으면서 shared owner를 포함합니다. multi-user 환경 apply 정책과 offline/quiesced single-writer 보장이 필요합니다.
- `[검증 필요]` archive entry symlink, Linux alias/escape, 실제 Windows junction·rename·open-handle fixture가 아직 없습니다.
- `[검증 필요]` owner별 schema validator, exact ZIP entry set, archive 크기 제한, same-volume staging, durable journal, rollback incomplete evidence는 후속 PR 범위입니다.
- `[운영 필요]` PR #251 required check는 GitHub Actions runner/실행 환경이 정상화된 뒤 재실행해야 합니다. 현재 실패 run에는 실행 step과 로그가 없습니다.
- apply 차단은 위 조건과 후속 PR-B/C/D 전체 gate가 끝날 때까지 해제하지 않습니다.

## 롤백 기준

- 이 PR은 runtime 경로에 연결되지 않은 내부 계약 추가이므로 문제가 발견되면 해당 단일 commit을 revert합니다.
- writer·preview 연결 전에 owner ID, logical path 또는 scope 변경이 필요하면 format v1을 사용하기 시작하지 말고 계약 PR에서 먼저 수정합니다.
- 선행 PR #250의 restore apply 차단은 이 PR 롤백 여부와 무관하게 유지합니다.

## 다음 라운드

1. Issue #229 PR-B에서 암호화 정책을 확정하고 read-only owner collector, exact-set archive writer, strict preview reader를 fixture 전용으로 구현합니다.
2. legacy ZIP과 owner-v1 apply는 계속 차단하고 user A/B namespace mismatch가 staging 전에 실패하는지 검증합니다.
3. PR-C에서 same-volume staging·journal·injected failure rollback을 구현한 뒤 PR-D에서 doctor와 제한적 apply 활성화 여부를 판단합니다.
