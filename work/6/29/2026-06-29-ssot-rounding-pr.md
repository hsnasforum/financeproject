# 2026-06-29 SSOT rounding 정리 및 PR 준비

## 변경 파일
- `src/lib/planning/calc/roundingPolicy.ts`
- `src/lib/planning/server/assumptions/snapshotsRouteService.ts`
- `src/lib/planning/server/runs/createRunService.ts`
- `src/lib/planning/v3/alerts/store.ts`
- `src/lib/planning/v3/indicators/analytics.ts`
- `src/lib/planning/v3/indicators/cli/refresh.ts`
- `src/lib/planning/v3/indicators/connectors/ecos.ts`
- `src/lib/planning/v3/indicators/connectors/fred.ts`
- `src/lib/planning/v3/indicators/connectors/kosis.ts`
- `src/lib/planning/v3/news/cli/newsRefresh.ts`
- `src/lib/planning/v3/news/contradiction.ts`
- `src/lib/planning/v3/news/evidenceGraph/ssot.ts`
- `src/lib/planning/v3/news/ingest/fetchFeed.ts`
- `src/lib/planning/v3/news/llmAdapter.ts`
- `src/lib/planning/v3/news/recovery.ts`
- `src/lib/planning/v3/news/select/score.ts`
- `src/lib/planning/v3/news/select/selectTop.ts`
- `src/lib/planning/v3/news/store/index.ts`
- `src/lib/planning/v3/news/trend.ts`
- `src/lib/planning/v3/news/trend/computeBurst.ts`
- `src/lib/planning/v3/news/trend/computeDailyStats.ts`
- `src/lib/planning/v3/ops/trim.ts`
- `src/lib/planning/v3/report/weeklyHtml.ts`
- `work/6/29/2026-06-29-ssot-rounding-pr.md`

## 사용 skill
- `github:yeet`: 실제 push와 draft PR 생성 절차의 전제 조건, staging, push, PR 본문 요구사항을 확인하는 데 사용했습니다.
- `planning-gate-selector`: SSOT/rounding/release 영향 범위에 맞는 검증 게이트를 고르는 데 사용했습니다.
- `work-log-closeout`: `/work` 종료 기록의 섹션과 실제 실행 명령 기록을 맞추는 데 사용했습니다.

## 변경 이유
- `planning:ssot:check`가 `src/lib/planning/**` 내부 직접 `Math.round`/`Math.floor` 사용 38건을 advisory 실패로 보고했습니다.
- rounding 기준이 모듈마다 흩어지면 계산/표시/입력 clamp 정책이 다시 드리프트할 수 있어, 허용된 `src/lib/planning/calc/roundingPolicy.ts`로 책임을 모을 필요가 있었습니다.
- 사용자는 advisory SSOT rounding 후속 작업과 실제 push/PR 생성을 요청했습니다.

## 핵심 변경
- `roundingPolicy`에 `roundToInteger`, `floorToInteger`, `clampRoundedInteger`, `clampFlooredInteger`를 추가했습니다.
- server, planning v3 news/indicators/alerts/ops/report 모듈의 직접 `Math.round`/`Math.floor` 호출을 rounding policy helper로 교체했습니다.
- 기존 소수점 3자리, 일수/timeout/retry clamp, 원 단위 반올림 의미는 유지했습니다.
- route, API 응답, 저장 포맷, migration은 변경하지 않았습니다.

## 검증
- `corepack pnpm planning:ssot:check` PASS, 5 files / 9 tests.
- `corepack pnpm test planning/v3/news/cli/newsRefresh.test.ts planning/v3/news/contradiction.test.ts planning/v3/news/evidenceGraph/ssot.test.ts planning/v3/news/llmAdapter.test.ts planning/v3/news/recovery.test.ts planning/v3/news/select/deterministic.test.ts planning/v3/news/store/store.test.ts planning/v3/news/trend.test.ts planning/v3/news/trend/computeBurst.test.ts planning/v3/news/trend/computeDailyStats.test.ts planning/v3/alerts/store.test.ts planning/v3/indicators/analytics.test.ts planning/v3/indicators/cli/refresh.test.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/kosis.test.ts planning/v3/ops/trim.test.ts planning/v3/report/weeklyHtml.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts` PASS, 19 files / 58 tests.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm lint` PASS.
- `corepack pnpm planning:v2:complete` PASS, fast e2e 6 tests 포함.
- `corepack pnpm build` PASS.
- `corepack pnpm release:verify` PASS.
  - 내부 `pnpm test` PASS, 738 files / 2437 tests.
  - 내부 `planning:ssot:check` PASS, 5 files / 9 tests.

## 남은 리스크
- 이 변경은 정책 helper 이동이므로 대량 데이터 migration, rollback, quarantine 대상은 없습니다.
- PR 생성 후 GitHub Actions 결과는 원격에서 별도 확인이 필요합니다.

## 다음 라운드 우선순위
- 커밋 후 push하고 draft PR을 생성합니다.
- PR 생성 후 원격 체크 상태를 확인합니다.
