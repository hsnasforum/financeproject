# 2026-06-28 P1-05 draft storage boundary 종료 기록

## 범위
- 기준 SHA: `2d47134f`
- 대상: cashflow draft와 profile draft의 저장 경계를 분리하고, legacy flat draft 파일은 유형이 명확할 때만 호환 fallback으로 읽도록 변경했습니다.
- 실제 topology/env 확인: 현재 프로세스 env에는 `PLANNING_*`, `NODE_ENV`, `DATABASE_URL` 계열 키가 없었습니다. repo env 파일에는 `.env.local:DATABASE_URL`만 실제 로컬 값으로 존재했고, `PLANNING_*`는 example 파일에만 있었습니다.
- 실제 draft inventory: 기본 non-production 루트 `.data/planning` 기준 `planning-v3/drafts`와 `v3/drafts`에 draft JSON이 없어 migration 대상 0건, quarantine 대상 0건, rollback 대상 0건입니다.

## 사용 skill
- `planning-gate-selector`: P1-05가 planning v3 store/API/server import를 바꾸는 작업이라 targeted test, lint, typecheck, build 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, migration/rollback 증거, 남은 리스크를 `/work` 종료 기록으로 정리했습니다.

## 변경 파일
- `src/lib/planning/v3/store/draftStore.ts`: `drafts/cashflow/<id>.json`, `drafts/profile/<id>.json` 저장 경계, strict legacy parser, typed-primary 우선 정책, dry-run/apply/rollback migration helper를 추가했습니다.
- `src/lib/news/stressContext.ts`: stress context가 profile draft summary를 고르지 않도록 cashflow draft 전용 latest summary API를 사용하게 변경했습니다.
- `tests/planning-v3-draft-boundary.test.ts`: 저장 경계, stress summary, ambiguous legacy 거부, same-id typed primary 우선, migration quarantine/rollback 회귀 테스트를 추가했습니다.

## 변경 이유
- 기존 draft store는 cashflow draft와 profile draft를 같은 flat `drafts/<id>.json` 경로에 저장해 `listDrafts()`와 `listProfileDrafts()`가 서로의 파일을 오염시킬 수 있었습니다.
- 기존 cashflow parser는 `source`, `cashflow`, `summary`가 없는 legacy flat 파일도 기본값으로 정규화할 수 있어 소유자/유형 불명 데이터를 조용히 정상 draft로 승격할 위험이 있었습니다.
- stress context는 `listDrafts()[0]`에 의존해 profile draft의 빈 summary를 cashflow summary처럼 사용할 수 있었습니다.
- 문서 기준으로 legacy 데이터는 자동 배정하지 않고, 명확하지 않은 파일은 quarantine되어야 합니다.

## 핵심 변경
- 신규 cashflow draft는 `planning-v3/drafts/cashflow`, 신규 profile draft는 `planning-v3/drafts/profile`에만 저장합니다.
- legacy flat 파일은 cashflow/profile 중 하나로만 strict하게 판정될 때만 list/get/delete fallback 대상이 됩니다.
- typed primary와 같은 ID의 legacy flat 파일이 공존하면 typed primary를 우선하고 list에서 legacy 중복을 제외합니다.
- ambiguous legacy flat 파일은 list 단계에서 `StorageCorruptedError`로 실패하며, migration apply 시 `_quarantine`으로 이동합니다.
- `migrateDraftStorageBoundaries({ dryRun | rollback })`를 추가해 dry-run, backup, apply, quarantine, rollback 리포트를 반환합니다.
- `getLatestCashflowDraftSummary()`를 추가해 stress context가 cashflow draft summary만 읽도록 했습니다.

## 검증
- 수정 전 실패 증거:
  - `corepack pnpm test tests/planning-v3-draft-boundary.test.ts` FAIL: 5 tests. profile draft가 cashflow list에 포함, cashflow draft가 profile list를 깨뜨림, ambiguous legacy가 기본값으로 정규화됨, same-id typed primary보다 legacy가 앞섬, migration export 없음.
- 수정 후 targeted:
  - `corepack pnpm test tests/planning-v3-draft-boundary.test.ts` PASS: 5 tests.
  - `corepack pnpm test tests/planning-v3-draft-boundary.test.ts tests/planning-v3-profileDraftStore.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3/api-drafts-route.test.ts tests/planning-v3/api-drafts-id-route.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-drafts-user-scope.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts` PASS: 10 files, 43 tests.
- 정적/통합:
  - `corepack pnpm typecheck` PASS.
  - `corepack pnpm lint` PASS.
  - `git diff --check` PASS.
  - `corepack pnpm build` PASS. 첫 실행은 184초 제한으로 exit code를 회수하지 못해 검증에서 제외했고, 프로세스 종료 확인 후 600초 제한으로 재실행해 PASS를 확인했습니다.
  - `corepack pnpm test` PASS: 731 files, 2403 tests.
- inventory/topology:
  - 값 노출 없이 env key만 확인했습니다. 현재 프로세스 env에는 planning 관련 키가 없고, 실제 로컬 env 파일은 `.env.local:DATABASE_URL`만 확인됐습니다.
  - `find .data/planning -maxdepth 4 -type d`와 JSON count inventory 확인 결과, 기본 루트에는 draft root가 없어 migration/quarantine 대상이 0건입니다.

## migration / rollback / 호환성
- 실제 workspace에는 legacy draft 대상이 0건이라 운영 데이터 apply는 수행하지 않았습니다.
- 테스트에서 cashflow legacy 1건과 ambiguous legacy 1건을 만들어 dry-run 후보 2건, apply 시 migrated 1건/quarantined 1건/backupsWritten 2건, rollback 시 rolledBack 2건/backupsWritten 0건을 검증했습니다.
- 저장 포맷 변화: 신규 파일은 typed subdirectory에 저장됩니다. 기존 flat primary/secondary legacy 경로는 strict 판정되는 파일에 한해 read/delete fallback으로 유지됩니다.
- API 응답 계약은 변경하지 않았습니다. `/api/planning/v3/drafts`와 profile draft API는 같은 응답 형태를 유지하되, 내부 저장 경계가 분리됩니다.
- ambiguous legacy 파일은 자동 배정하지 않고 migration apply에서 `_quarantine`으로 이동합니다. rollback은 backup payload를 원래 flat 경로로 복원하고 typed/quarantine target을 제거합니다.

## 남은 리스크
- 실제 운영/사용자 draft 데이터가 현재 workspace에 없어 대량 legacy inventory나 충돌 수는 0건으로만 확인됐습니다.
- migration helper는 파일 단위 backup과 atomic write를 사용하지만, 다중 Node 프로세스가 같은 `PLANNING_DATA_DIR`을 공유하는 운영 topology에서는 외부 inter-process lock 또는 단일 운영 창구로 apply를 직렬화해야 합니다.
- ambiguous 파일을 list에서 즉시 실패시키므로, 운영에 그런 파일이 있으면 사용자 목록 조회 전에 dry-run inventory와 quarantine 계획을 먼저 실행해야 합니다.
- P1-05는 draft 저장 경계까지만 처리했습니다. 다음 순서는 문서 기준 P1-06 provenance, P1-07 desktop artifact, P1-08 run application service입니다.
