# 2026-07-12 Issue #239 경제지표 refresh canonical owner

## 변경 파일

- `docs/deploy.md`
- `docs/planning-v3-refresh-owners.md`
- `scripts/indicators_refresh.mjs`
- `src/app/api/planning/v3/indicators/specs/route.ts`
- `src/lib/indicators/contracts.ts`
- `src/lib/indicators/state.ts`
- `src/lib/indicators/types.ts`
- `src/lib/news/alerts.ts`
- `src/lib/planning/v3/indicators/cli/refresh.ts`
- `src/lib/planning/v3/indicators/contracts.ts`
- `src/lib/planning/v3/indicators/specOverrides.ts`
- `src/lib/planning/v3/indicators/store/index.ts`
- `tests/news-alerts.test.ts`
- `tests/planning-v3-indicators-specs-import-api.test.ts`
- `tests/planning-v3-indicator-refresh-owner-contract.test.ts`
- `work/7/12/2026-07-12-issue-239-indicator-refresh-owner.md`

## 사용 skill

- `finance-skill-routing`: Issue #239의 첫 PR을 경제지표 owner 통합으로 좁히고 뉴스 전환을 별도 범위로 분리했습니다.
- `dart-data-source-hardening`: config 누락·malformed state·부분 실패·freshness·fixture fallback을 fail-closed 기준으로 검토했습니다.
- `planning-gate-selector`: 변경된 runner, API, 저장 계약에 필요한 focused test, lint, typecheck, security scan, full test, build 범위를 선택했습니다.
- `work-log-closeout`: 실제 실행한 검증, 계약 영향, 롤백 기준과 후속 중단 조건을 표준 종료 기록으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/239
- 기준 main: `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- 작업 브랜치: `codex/239-canonical-refresh`
- specs API/UI는 planning v3 runtime override를 사용하지만 package·daily·refresh-all 경로는 legacy config/runner를 호출해 설정과 저장 owner가 달랐습니다.
- legacy runner와 v3 runner가 같은 `indicators/state.json`에 서로 다른 envelope를 써 source cursor/etag 또는 v3 series 상태를 제거할 수 있었습니다.
- 이 라운드는 Issue #239의 경제지표 절반만 구현합니다. 뉴스 runner와 SQLite/file-store 전환은 예약 실행의 사용자 namespace와 기존 reader 소유권이 확정되지 않아 별도 PR로 남깁니다.

## 핵심 변경

- legacy config 두 파일을 compatibility base로 읽고 runtime `specOverrides.json`을 최종 우선순위로 적용하는 effective config loader 하나로 API, package runner와 alert 평가를 정렬했습니다. 한 파일 누락, malformed/duplicate/unknown source 설정은 빈 기본값으로 축약하지 않습니다.
- package command는 planning v3 runner만 호출합니다. non-dry 실행에서 config가 모두 빠지면 built-in fixture를 실제 데이터로 쓰기 전에 중단하고, source 일부 실패 시 stale alert 평가를 건너뛴 뒤 exit 1로 종료합니다.
- 기존 `state.json`의 legacy `sources` cursor/etag와 v3 `series` 상태를 양쪽 reader/writer가 함께 보존합니다. malformed state는 원문을 덮어쓰지 않으며 stored series/meta/state 경로와 schemaVersion은 유지합니다.
- 월·분기·연도 관측치는 기간 key로 중복을 판단합니다. 같은 기간·같은 값은 건너뛰고 다른 값은 기존 JSONL을 수정하지 않은 채 PARSE 오류로 남깁니다.
- indicator alert는 canonical effective config와 v3 JSONL을 읽고 source와 spec이 모두 enabled인 series만 평가합니다. disabled source/spec의 stale JSONL은 뉴스·지표 갱신 경보에 사용하지 않습니다.
- public API URL과 성공 wrapper는 유지합니다. malformed runtime override에는 `STORAGE_CORRUPT`, 잘못된 compatibility config에는 `INDICATOR_CONFIG_INVALID` 500 envelope를 추가했습니다. DB schema/query, cache/revalidation, destructive migration은 없으며 실제 사용자 데이터 rewrite나 restore apply는 실행하지 않았습니다.

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/planning-v3-indicator-refresh-owner-contract.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/news-alerts.test.ts tests/planning-v3-canonical-source-contract.test.ts tests/indicators-contracts.test.ts tests/indicators-store-state.test.ts tests/indicators-refresh.test.ts tests/indicators-ecos.test.ts tests/indicators-fred.test.ts tests/indicators-kosis.test.ts tests/indicators-query.test.ts tests/planning-v3-news-digest-indicator-root.test.ts tests/planning-v3-news-alerts-api.test.ts --reporter=dot`: PASS, 13 files / 50 tests
- `node --check scripts/indicators_refresh.mjs`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm typecheck`: PASS
- `corepack pnpm typecheck:planning:v3`: PASS
- `corepack pnpm sec:scan:routes`: PASS, devRoutes 37 / opsRoutes 38 / prodHiddenPages 7 / publicMutationAllowlist 0 / opsActions 3
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages
- raw build 직후 `node scripts/planning_v2_desktop_build.mjs --no-next-build`: FAIL, `.next/standalone`의 pnpm 내부 symlink 32개 중 `@img/sharp-libvips-linux-x64`에서 strict no-symlink guard가 중단했습니다. Issue #223 재현 댓글: https://github.com/hsnasforum/financeproject/issues/223#issuecomment-4948834566
- source-only audit alias 2개를 제외하고 standalone 복사본을 dereference한 뒤 `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/desktop-artifact-provenance.test.ts --reporter=dot`: PASS, 1 file / 6 tests
- 같은 materialized standalone 상태에서 `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, exit 0
- 독립 read-only reviewer 최종 판정: P0/P1 없음. 중간 P1인 partial refresh stale alert, non-dry built-in fixture 저장, disabled-source stale alert를 모두 수정 후 재검토했습니다.
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- E2E는 route, page, selector, 사용자 UI를 변경하지 않아 실행하지 않았습니다.

## 남은 리스크

- [blocked] Issue #239의 뉴스 절반은 scheduled refresh가 사용할 사용자 namespace와 `news.sqlite` 대 v3 per-user file/cache reader의 canonical owner가 정해지기 전에는 전환하지 않습니다.
- `daily_refresh.mjs` 자체가 non-strict child failure를 최종 성공으로 축약할 수 있는 문제는 Issue #240 범위입니다. 이번 package runner는 exit 1을 반환하지만 outer orchestration 보장은 아직 없습니다.
- raw Next standalone의 pnpm 내부 symlink 32개 때문에 strict desktop artifact build는 현재 main clean build에서도 fail-closed합니다. Issue #223에 재현을 남겼고 Issue #241에도 release gate 입력으로 연결했습니다: https://github.com/hsnasforum/financeproject/issues/241#issuecomment-4948834897
- Q/Y 충돌과 같은 값·다른 날짜 표현의 skip 동작은 구현되어 있으나 M 충돌 외 직접 회귀 테스트가 없습니다.
- indicator file store의 다중 프로세스 atomic write와 single-writer 강제는 이번 범위가 아니며 Issue #234와 deployment 결정에 의존합니다.
- `readSeriesObservations`는 기존 malformed JSONL row를 계속 건너뜁니다. 이번 변경은 새 기간 충돌과 malformed state/override만 fail-closed로 좁혔습니다.
- rollback은 package adapter, effective config loader와 dual-state preservation을 함께 되돌려야 합니다. package command만 legacy runner로 되돌리거나 preserved `sources`/`series` 필드를 삭제하면 안 되며, output mismatch 시 scheduled caller만 compatibility adapter로 제한합니다.

## 다음 라운드 우선순위

1. Issue #239 뉴스 절반은 scheduled user namespace와 `news.sqlite` reader inventory를 확정한 뒤 별도 PR로 진행합니다.
2. Issue #240에서 daily refresh outer orchestration이 child partial failure를 성공으로 축약하지 않도록 fail-closed 계약을 적용합니다.
3. Issue #223 재현과 Issue #241 release gate에서 raw Next standalone의 pnpm 내부 symlink materialization 정책을 결정합니다.
