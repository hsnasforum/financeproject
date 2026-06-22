# 2026-06-22 Freshness strict timestamp gate

## 변경 파일
- `scripts/data_freshness_report.mjs`
- `tests/data-freshness-report.test.ts`
- `docs/data-freshness-report.md`
- `work/6/22/2026-06-22-freshness-strict-timestamp-gate.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`에서 stale freshness 해소 라운드를 이어받았습니다.
- `planning-gate-selector`: freshness script와 테스트 변경에 맞춰 targeted vitest, syntax check, lint, typecheck, guard를 선택했습니다.
- `dart-data-source-hardening`: stale, missing timestamp, invalid timestamp가 성공처럼 보이지 않도록 strict 실패 모드를 점검했습니다.
- `work-log-closeout`: 실행한 검증과 live refresh 미실행 사유를 종료 기록으로 남깁니다.

## 변경 이유
- 현재 `.data` 루트 tracked snapshot 8건은 2026-05-25 생성 기준이라 2026-06-22 현재 strict freshness report에서 모두 stale입니다.
- 현재 환경에는 `OPENDART_API_KEY`, `FINLIFE_API_KEY`, `FINLIFE_TOPFIN_GRP_LIST`, `DATAGO_SERVICE_KEY`, `KDB_DATAGO_SERVICE_KEY`가 없어 live refresh/smoke로 stale을 해소할 수 없습니다.
- strict freshness gate는 stale만 실패 처리하고 timestamp 누락/오류는 경고만 남길 수 있어 운영 freshness 증거로 부족합니다.

## 핵심 변경
- strict mode가 stale, missing timestamp, invalid timestamp 중 하나라도 있으면 실패하도록 강화했습니다.
- timestamp 누락/오류 fixture 테스트를 추가했습니다.
- `docs/data-freshness-report.md`를 현재 strict 실행 결과로 갱신해 stale 8건을 명시했습니다.

## 검증
- PASS: `node --check scripts/data_freshness_report.mjs`
- PASS: `./node_modules/.bin/vitest run tests/data-freshness-report.test.ts` (1 file, 3 tests)
- EXPECTED FAIL: `node scripts/data_freshness_report.mjs --strict` (stale 8건으로 exit 1)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm multi-agent:guard` (로컬 출력의 latestWorkNote는 직전 tracked note 기준)
- PASS: `git diff --check`

## 남은 리스크
- source별 live smoke 또는 `daily:refresh:strict`는 필요한 API key와 upstream 접근이 없어 이번 환경에서는 실행하지 못했습니다.
- stale 8건 자체는 해소되지 않았고, 실패 증거와 strict gate 강화까지만 완료했습니다.

## 다음 라운드
- API key가 있는 운영 환경에서 `pnpm daily:refresh:strict` 또는 source별 live smoke를 실행해 stale 8건을 실제 갱신합니다.
- live 실행 후 `node scripts/data_freshness_report.mjs --strict`를 다시 실행해 fresh/strict PASS 증거를 `/work`에 남깁니다.
