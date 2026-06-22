# 2026-06-22 Daily refresh public sources

## 변경 파일
- `scripts/daily_refresh.mjs`
- `tests/daily-refresh-ops-contract.test.ts`
- `work/6/22/2026-06-22-daily-refresh-public-sources.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 확인 후 Ops/Data Freshness 라운드를 이어갔습니다.
- `planning-gate-selector`: daily refresh script와 contract test 변경에 맞춰 syntax check, targeted vitest, lint, typecheck를 선택했습니다.
- `dart-data-source-hardening`: FinLife, DataGo, Gov24 freshness 실패가 성공처럼 보이지 않도록 필수 단계 계약을 점검했습니다.
- `work-log-closeout`: 변경 파일, 검증, 잔여 리스크를 종료 기록으로 남겼습니다.

## 변경 이유
- 기존 `daily:refresh`는 news, indicators, DART 중심으로 실행되어 FinLife, DataGo, Gov24 freshness 상태가 daily 결과에서 빠질 수 있었습니다.
- source별 스크립트가 누락되거나 실패할 때 operator가 stale/partial 상태를 성공으로 오해하지 않도록 required step으로 기록해야 합니다.
- strict 모드는 운영 릴리스 게이트에서 필수 public 데이터 소스 누락을 실패로 판정해야 합니다.

## 핵심 변경
- `daily:refresh` 실행 계획에 `finlife:sync:if-stale`, `datago:sync`, `gov24:sync:if-stale`를 필수 단계로 추가했습니다.
- public source refresh는 warm cache 이후, news와 indicators 이전에 실행되도록 순서를 고정했습니다.
- contract test가 세 source의 정상 실행 순서와 stdout tail 기록을 확인합니다.
- strict 모드에서 세 source script 누락이 required failure로 기록되는지 검증합니다.

## 검증
- PASS: `node --check scripts/daily_refresh.mjs`
- PASS: `./node_modules/.bin/vitest run tests/daily-refresh-ops-contract.test.ts` (2 tests)
- PASS: `corepack pnpm multi-agent:guard`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `git diff --check`

## 남은 리스크
- `pnpm daily:refresh:strict` live 실행은 외부 API key와 네트워크 상태에 따라 시간이 걸리므로 이번 로컬 계약 검증과 분리합니다.
- `.data/ops/jobs` 파일 큐나 PostgreSQL job table 승격은 변경하지 않았습니다.

## 다음 라운드
- stale freshness snapshot 8건을 strict refresh 또는 source별 smoke 증거로 해소할지 실제 env 상태에 맞춰 분리합니다.
