# 2026-07-11 Issue #229 암호화 owner archive·strict preview

## 변경 파일

- `src/lib/ops/backup/planningOwnerCollector.ts`
- `src/lib/ops/backup/planningOwnerArchive.ts`
- `src/lib/ops/backup/zipCodec.ts`
- `src/lib/planning/v3/ops/export.ts`
- `src/lib/planning/v3/ops/restore.ts`
- `planning/v3/ops/ownerArchive.test.ts`
- `docs/planning-owner-backup-contract.md`
- `OPERATIONS_GUIDE.md`
- `work/7/11/2026-07-11-issue-229-owner-archive-preview.md`

## 사용 skill

- `finance-skill-routing`: Issue #229 PR-B에 필요한 최소 local skill 조합 선택
- `planning-gate-selector`: 내부 archive 계약·CLI 변경에 맞는 focused 및 전체 gate 선택
- `work-log-closeout`: 변경·검증·잔여 위험을 `/work` 인수인계 형식으로 기록
- `github:github`: 선행 Issue·stacked PR 상태와 중복 범위 확인
- `github:yeet`: 명시 파일만 commit·push하고 stacked draft PR을 게시하는 절차 적용
- `github:gh-fix-ci`: 원격 Actions 실패 시 step·로그 존재 여부를 확인해 코드 실패와 인프라 실패를 분리

## 변경 이유

Issue #229 PR-A의 17-owner registry와 manifest 계약을 실제 read-only collector, 암호화 writer, strict preview에 연결했습니다. 기존 평문 v3 ZIP의 범위를 stable profile/run까지 넓히지 않고 opt-in 형식을 새로 만들었으며, 선행 PR #250의 restore apply 차단은 그대로 유지했습니다. 실제 사용자 데이터에는 export 또는 restore apply를 실행하지 않았습니다.

## 핵심 변경

1. owner source를 `lstat`·`realpath`·no-follow handle로 읽고 symlink, special file, escape, alias, 읽기 중 변경, entry·전체 크기 초과를 fail-closed로 거부합니다.
2. manifest와 payload ZIP을 고정 scrypt + AES-256-GCM envelope로 암호화하고 passphrase literal/env 입력, 짧은 secret, owner 내부 auxiliary 경로, 기존 출력 덮어쓰기를 금지합니다.
3. 같은 directory의 `0600` 임시 파일을 `fsync`한 뒤 hard-link no-clobber와 directory `fsync`로 원자 게시하고, POSIX directory chain의 UID·write/sticky policy를 확인합니다. native Windows ACL 미검증 writer와 passphrase-file 입력은 fail-closed입니다.
4. strict preview가 envelope/KDF/base64/ZIP 한도, raw UTF-8 이름, canonical path, exact entry set, file·owner checksum, namespace를 모두 확인하며 활성 데이터는 쓰지 않습니다.
5. valid·손상·잘린 runtime-key stable 암호 payload는 portable adapter가 없으므로 raw export하지 않고 명시적 오류로 중단합니다.
6. 기존 export/restore 기본 동작은 유지하고 `--format=owner`에서만 새 CLI를 사용합니다. `--apply`는 archive와 passphrase 읽기 전에 계속 차단됩니다.

## 영향 범위

- public API: 없음
- 응답 shape: HTTP 응답 변경 없음. 내부 async API와 opt-in CLI summary만 추가했습니다.
- stored data: 기존 owner 원본은 read-only입니다. 별도 encrypted owner archive format v1만 새로 생성합니다.
- DB query: 없음
- cache/revalidation: 없음
- migration: 없음. legacy archive와 runtime-key stable payload를 변환하지 않습니다.

## 검증

- `pnpm exec vitest run planning/v3/ops/ownerArchive.test.ts planning/v3/ops/ownerContract.test.ts planning/v3/ops/export.test.ts planning/v3/ops/restore.test.ts`: PASS, 4 files / 34 tests
- `pnpm typecheck`: PASS
- 변경 파일 focused ESLint: PASS
- `pnpm lint`: PASS
- `pnpm test`: PASS, 806 files / 2,741 tests. 첫 시도에서 무관한 static guard 1건이 병렬 부하로 5초 timeout됐으나 단독 2/2 PASS 후 전체 재실행이 전부 통과했습니다.
- `pnpm planning:v2:e2e:fast`: PASS, 8 tests
- `pnpm planning:v2:complete`: PASS, security·guard·smoke와 격리 fast E2E 8 tests. 첫 시도 냉시작 compile이 URL timeout을 넘었으나 단독 fast E2E와 전체 재실행은 통과했습니다.
- `pnpm planning:v2:compat`: PASS, compat fixture 8 tests와 격리 fast E2E 8 tests
- `pnpm planning:v2:ops:safety`: PASS, 임시 fixture ops run·legacy backfill
- `pnpm planning:auth:check`: PASS, 75 tests
- `pnpm planning:user-scope:check`: PASS, 88 tests
- `pnpm verify`: PASS, 806 files / 2,741 tests. 첫 시도에서 무관한 기존 backup rollback fixture 1건이 병렬 상태 간섭으로 실패했으나 해당 파일 단독 33/33 PASS 후 verify 재실행이 통과했습니다.
- `pnpm build`: PASS, 264.7초
- `pnpm multi-agent:guard`: PASS, tracked 23 / coverage 16
- `git diff --check`: PASS
- 자동 생성 `schema-drift`, `data-freshness`, `dart-rules-quality` 보고서 변경: 원복. 검증 시점 snapshot 8건 stale과 `rules_eval.json` 부재 DART gate SKIP은 기존 외부 데이터 상태로 기록합니다.
- 암호화·ZIP/path·CLI 세 관점 독립 read-only 재검토: 잔존 P0/P1 없음
- commit: `8ce00413412ef15012890991ed6156075be2e98e`
- stacked draft PR: [#252](https://github.com/hsnasforum/financeproject/pull/252), base `codex/229-owner-manifest`, open·draft·mergeable
- PR #252 원격 CI: run `29150610155`의 `verify`, run `29150610134`의 `dart_index_missing`·`core_flows`·`dart_index_present`가 모두 `steps=[]`, 로그 blob 404로 선행 실패했습니다. 로컬 코드 수정 근거가 없는 GitHub Actions 계층 실패이며 runner 정상화 후 재실행이 필요합니다.
- 실제 사용자 데이터 restore apply: 실행하지 않음

## 남은 리스크

- `[운영 결정 필요]` `--ack-quiesced`는 실제 app drain·single-writer lock이 아닙니다. PR-B writer는 fixture·실험용이며 운영 기본값으로 승격할 수 없습니다.
- `[기능 제한]` runtime key로 암호화된 stable profile/run 파일의 logical portable adapter가 없어 해당 파일이 있으면 export가 중단됩니다.
- `[플랫폼 제한]` 실제 Windows junction·reparse point, ACL, rename·open-handle 동작은 검증되지 않아 native Windows writer와 passphrase-file 입력을 코드에서 차단합니다.
- `[낮은 잔존 위험]` publish 전 process crash는 최종 파일 대신 암호화된 `0600` orphan temp를 남길 수 있습니다. 최종 이름은 incomplete 상태로 게시되지 않으며 후속 운영 cleanup 정책은 PR-D에서 결정합니다.
- `[낮은 잔존 위험]` POSIX `openat2`를 사용하지 않지만 untrusted writable directory chain은 거부합니다. 동일 UID·root의 경쟁은 이미 owner 직접 변경 권한을 가진 주체라 추가 권한 확대는 아닙니다.
- `[외부 상태]` 현재 fixture snapshot 8건은 freshness 기준 stale이고 DART rules evaluation 파일이 없어 해당 quality gate는 SKIP입니다. PR-B 코드 실패는 아닙니다.
- `[운영 필요]` PR #252 required check는 GitHub Actions가 job step을 시작하지 못한 상태라 runner/실행 환경 정상화 후 재실행해야 합니다.
- `[후속 PR]` same-volume staging, durable journal, injected failure rollback, pending recovery, owner별 schema doctor는 PR-C/D 범위입니다.
- apply 차단은 PR-C/D와 전체 gate가 끝날 때까지 유지합니다.

## 롤백 기준

- 새 기능은 `--format=owner` opt-in이므로 문제가 발견되면 PR-B 단일 commit을 revert하고 기존 legacy export와 read-only preview를 유지합니다.
- 생성된 실험 archive는 원본 owner 데이터를 변경하지 않으므로 폐기할 수 있습니다. archive가 생성됐다는 이유로 수동 복원·rename·copy를 수행하지 않습니다.
- secret 노출, owner source 변경, checksum 검증 누락, namespace 우회, archive 경로 owner 침범이 확인되면 writer 사용을 즉시 중단하고 apply 차단을 유지합니다.

## 다음 라운드

1. PR-C에서 target별 same-volume staging, durable journal state machine, injected failure rollback과 pending recovery를 구현합니다.
2. PR-D에서 registry 기반 doctor와 제한적 apply 활성화 조건을 검증하되 Windows·single-writer 조건이 충족되지 않으면 apply 차단을 유지합니다.
3. GitHub Actions runner가 정상화되면 PR #251·#252의 required check를 재실행합니다.
