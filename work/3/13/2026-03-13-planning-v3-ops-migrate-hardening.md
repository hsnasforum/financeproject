# 2026-03-13 planning-v3 ops-migrate hardening

## 변경 파일
- `planning/v3/ops/migrate.test.ts`
- `work/3/13/2026-03-13-planning-v3-ops-migrate-hardening.md`

## 사용 skill
- `planning-gate-selector`: internal-only migrate 배치에 맞춰 `vitest + eslint + diff check`만 실행하도록 검증 범위를 잠그는 데 사용
- `work-log-closeout`: 이번 라운드의 실제 변경, 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- 직전 `balances read-wrapper alignment`는 audit-only로 닫혔고, 다음 우선순위를 남은 isolated wrapper 또는 internal-only 축으로 넘겼다.
- 남아 있는 wrapper/write-import 후보는 `transactions`, `batches`, `csv parse`, `drafts upload`, `categories alias`처럼 범위가 넓다.
- 반면 `planning/v3/ops/migrate.ts`는 단일 구현 파일이고 직접 대응 테스트 `planning/v3/ops/migrate.test.ts`로 닫을 수 있는 가장 작은 internal-only 축이다.
- 현재 브랜치 `pr37-planning-v3-txn-overrides`는 이번 `ops-migrate hardening` 축과 어긋나므로, 이번 라운드도 migrate runner 계약만 잠그고 더 넓은 helper/store 축으로 번지지 않게 제한했다.

## 핵심 변경
- `planning/v3/ops/migrate.ts`를 audit한 결과, dry-run/apply 분기, backup 생성, validation block, doctor summary 연결, target 9개 목록은 현재 계약과 어긋나지 않아 추가 로직 수정은 하지 않았다.
- 기존 dirty 상태로 남아 있던 `planning/v3/ops/migrate.ts`의 `catch (error)` -> `catch` 정리는 계약 변경이 아니라 unused binding 제거 수준으로 판단하고 그대로 유지했다.
- `planning/v3/ops/migrate.test.ts`에 preview target count 9개와 non-mutating missing schemaVersion upgrade를 명시적으로 잠갔다.
- `planning/v3/ops/migrate.test.ts`에 future schemaVersion warning이 write를 예약하지 않고 경고만 남기는 계약을 추가로 잠갔다.
- `planning/v3/ops/migrate.test.ts`에 malformed JSON과 non-object payload가 `SCHEMA_INVALID`로 집계되고 `apply`를 `MIGRATE_BLOCKED:VALIDATION_FAILED`로 막는 계약을 추가로 잠갔다.
- apply 테스트의 doctor summary는 존재 여부만 보지 않고 `{ ok, errors, warnings }` shape를 확인하도록 강화했다.

## 검증
- 기준선 확인
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-balances-read-wrapper-alignment.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-profile-store-wrapper-alignment.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-store-helper-next-batch-breakdown.md`
- 상태 잠금
  - `git status --short -- planning/v3/ops/migrate.ts planning/v3/ops/migrate.test.ts planning/v3/ops/doctor.ts planning/v3/ops/doctor.test.ts`
- audit
  - `sed -n '1,260p' planning/v3/ops/migrate.ts`
  - `sed -n '261,520p' planning/v3/ops/migrate.ts`
  - `sed -n '1,280p' planning/v3/ops/migrate.test.ts`
  - `git diff -- planning/v3/ops/migrate.ts`
  - `sed -n '1,260p' planning/v3/ops/doctor.ts`
  - `rg -n "schemaVersion|preview|backup|doctor|validation|validate|dry|apply|targets|issues|summary" planning/v3/ops/migrate.ts planning/v3/ops/migrate.test.ts`
- 테스트
  - `pnpm exec vitest run planning/v3/ops/migrate.test.ts`
  - PASS
  - 변경 후 재실행: `5 tests` PASS
- lint
  - `pnpm exec eslint planning/v3/ops/migrate.ts planning/v3/ops/migrate.test.ts`
  - PASS
- diff 확인
  - `git diff -- planning/v3/ops/migrate.ts planning/v3/ops/migrate.test.ts`

## 미실행 검증
- `pnpm exec vitest run planning/v3/ops/doctor.test.ts`
  - migrate summary의 doctor 연결 자체는 현재 계약과 맞아 조건부 포함으로 열지 않았다.
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- `planning/v3/ops/migrate.ts`는 현재 테스트로 preview/apply/backup/validation/future-version 경계가 더 분명해졌지만, target file 9개가 참조하는 실제 schema 정의가 앞으로 바뀌면 migrate runner와 test를 같이 다시 잠가야 한다.
- doctor summary는 migrate에서 pass-through shape까지만 잠갔고, doctor 내부 집계 규칙 자체를 바꾸는 라운드는 아니었다.
- wrapper/write-import/store/helper 축은 이번 라운드에서 의도적으로 열지 않았으므로, 다음 배치도 한 축만 따로 분리해서 진행해야 한다.

## 다음 라운드 우선순위
1. 남은 isolated wrapper 또는 internal-only 축 중 하나만 다시 고르고, 이번 `ops/migrate` 범위는 재오픈하지 않는다.
2. `planning/v3/qa/goldenPipeline.test.ts`는 QA-only 축으로 따로 판단하고, migrate와 섞지 않는다.
3. `transactions write/import/merge`, `batches write/import`, `csv parse / drafts upload`, `categories alias`는 각각 별도 범위 메모 없이는 열지 않는다.
