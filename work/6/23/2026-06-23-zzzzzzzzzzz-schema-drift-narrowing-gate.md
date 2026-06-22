# 2026-06-23 schema drift narrowing gate

## 변경 파일
- `docs/schema-drift-report.md`
- `scripts/schema_drift_report.mjs`
- `src/lib/dataQuality/schemaDiff.ts`
- `tests/schema-diff.test.ts`
- `tests/schema-drift-report-script.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzz-schema-drift-narrowing-gate.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 기본/조건부 skill 적용 범위 확인.
- `planning-gate-selector`: schema drift, release gate, 검증 명령 범위 선정.
- `work-log-closeout`: `/work` 종료 기록 형식과 잔여 리스크 정리.
- `dart-data-source-hardening`: FinLife/DART류 외부 데이터 snapshot freshness와 fallback 문서 영향 확인.
- `gpt-5.3-codex-spark + xhigh`: `finlife_credit-loan_snapshot.json`의 샘플링 편향과 전체 타입 집합 정적 조사.

## 변경 이유
- [사실] `pnpm verify`가 `finlife_credit-loan_snapshot.json`의 `$.items[].options[].raw.crdt_grad_5`를 `null|number -> number` drift로 보고해 실패했습니다.
- [사실] 전체 snapshot에는 `null`과 `number`가 모두 남아 있었지만, fingerprint의 `arraySampleSize=3` 샘플 구간은 모두 `number`였습니다.
- [해석] 실제 raw 계약 제거라기보다 샘플링 구간 축소가 breaking처럼 표시된 false breaking에 가까웠습니다.
- [권고] baseline만 갱신하지 않고, 현재 타입이 baseline 타입의 진부분집합이면 `nonBreaking`으로 분류하도록 diff 정책을 좁게 조정했습니다.

## 핵심 변경
- schema diff 공용 로직과 CLI report 로직에 type narrowing 판정을 추가했습니다.
- `removed`, `added`, type widening/교체는 기존처럼 breaking/non-breaking 기준을 유지했습니다.
- `docs/schema-drift-report.md`는 `breaking=0`, `nonBreaking=1`로 갱신했습니다.
- 공용 diff 단위 테스트와 CLI script 회귀 테스트를 추가했습니다.

## 검증
- `git diff --check` PASS.
- `corepack pnpm test tests/schema-diff.test.ts tests/schema-drift-report-script.test.ts` PASS: 2 files, 4 tests.
- `corepack pnpm schema:report` PASS: `snapshots=10 breaking=0 nonBreaking=1`.
- `corepack pnpm verify` PASS: schema report `breaking=0 nonBreaking=1`, freshness `fresh=8 stale=0`, security checks PASS, Vitest 723 files / 2345 tests PASS.
- `corepack pnpm build` PASS.
- `corepack pnpm release:verify` PASS: cleanup, deps audit, planning v2 complete, compat/regress, full Vitest, SSOT advisory gate PASS.

## 남은 리스크
- [리스크] type narrowing을 non-breaking으로 보는 것은 운영 정책 선택입니다. 소비자가 `null` 존재 자체에 의존하는 계약이면 별도 breaking 정책이 필요합니다.
- [리스크] 이번 라운드는 저장된 snapshot과 gate 기준 검증이며, source별 live fetch 또는 upstream API smoke는 실행하지 않았습니다.
- [리스크] `pnpm verify`는 freshness/DART report의 생성 시각과 ageDays를 다시 흔들 수 있어, 이번 커밋에서는 관련 없는 생성 리포트 변경을 제외했습니다.

## 다음 라운드 우선순위
- PostgreSQL readiness gate와 release checklist를 이어서 실제 PR gate로 묶습니다.
- Planning API의 repository/data ownership 경계를 route handler 밖으로 더 좁힙니다.
- freshness/DART report 생성물이 검증 실행마다 불필요하게 dirty가 되지 않도록 별도 안정화 후보를 분리합니다.
