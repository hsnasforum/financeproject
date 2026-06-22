# 2026-06-22 Daily refresh indicators step

## 변경 파일
- `scripts/multi_agent_handoff_guard.mjs`
- `scripts/daily_refresh.mjs`
- `tests/daily-refresh-ops-contract.test.ts`
- `work/6/22/2026-06-22-daily-refresh-indicators-step.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 확인 후 Ops/Data Freshness 라운드로 범위를 전환했습니다.
- `planning-gate-selector`: ops script와 신규 테스트 변경에 맞춰 syntax check, targeted vitest, lint, typecheck를 선택했습니다.
- `dart-data-source-hardening`: daily refresh가 외부 데이터 freshness와 fallback 상태를 다루므로 필수 단계 누락과 strict 실패 동작을 점검했습니다.
- `work-log-closeout`: 실행한 검증과 남은 데이터 소스 통합 리스크를 종료 기록으로 정리했습니다.

## 변경 이유
- `indicators:refresh` 스크립트는 존재하지만 `daily:refresh` 실행 계획에는 포함되어 있지 않았습니다.
- news와 indicators는 알림 이벤트 소스에서 함께 사용되므로 daily refresh가 두 소스를 모두 갱신해야 운영 freshness 증거가 더 일관됩니다.
- strict 모드에서 필수 refresh 스크립트가 빠졌는데도 성공처럼 보이면 operator가 stale 상태를 놓칠 수 있습니다.

## 핵심 변경
- `scripts/daily_refresh.mjs`에 `indicators:refresh`를 `news:refresh` 다음 필수 단계로 추가했습니다.
- temp package fixture 기반 contract 테스트를 추가해 step 순서와 결과 JSON 기록을 검증했습니다.
- `indicators:refresh`가 package scripts에 없으면 strict 모드에서 required failure로 기록되도록 고정했습니다.
- `--skip-doctor` 상태에서도 `data:doctor`는 skipped step으로 남아 operator log에서 생략 사실이 보이도록 확인했습니다.

## 검증
- PASS: `node --check scripts/daily_refresh.mjs`
- PASS: `node --check scripts/multi_agent_handoff_guard.mjs`
- PASS: `./node_modules/.bin/vitest run tests/daily-refresh-ops-contract.test.ts` (2 tests)
- PASS: `corepack pnpm multi-agent:guard`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `git diff --check`

## 남은 리스크
- 이번 라운드는 indicators 추가에 한정했고 FinLife, DataGo, Gov24의 daily refresh 통합은 아직 남아 있습니다.
- `pnpm daily:refresh:strict` live 실행은 외부 데이터 소스와 시간이 걸리는 네트워크 호출을 포함할 수 있어 이번 로컬 검증에서는 실행하지 않았습니다.
- 별도 ops job table 전환이나 `.data/ops/jobs` 구조 변경은 하지 않았습니다.

## 다음 라운드
- FinLife, DataGo, Gov24 refresh를 daily refresh 또는 별도 ops job contract로 통합할지 source별 실패 모드 기준으로 좁힙니다.
