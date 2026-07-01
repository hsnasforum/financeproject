# 2026-06-28 P1-07 public API provenance 계약

## 변경 파일
- `src/lib/publicApis/contracts/types.ts`
- `src/lib/publicApis/providers/fx.ts`
- `src/lib/publicApis/providers/housing.ts`
- `src/lib/publicApis/providers/exchange.ts`
- `src/lib/publicApis/providers/benefits.ts`
- `src/lib/publicApis/providers/subscription.ts`
- `src/app/api/public/fx/route.ts`
- `src/app/api/public/housing/sales/route.ts`
- `src/app/api/public/housing/rent/route.ts`
- `src/app/api/dev/data-sources/ping/route.ts`
- `src/app/api/dev/public-apis/sample/route.ts`
- `src/lib/dataSources/pingState.ts`
- `tests/public-api-provenance.test.ts`
- `docs/api-utilization-draft.md`
- `docs/data-sources-settings-ops.md`
- `work/6/28/2026-06-28-p1-07-provenance-plan.md`
- `work/6/28/2026-06-28-p1-07-public-api-provenance.md`

## 사용 skill
- `planning-gate-selector`: public API provider, route, data-source UI 변경에 필요한 targeted test, typecheck, lint, build, e2e 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행 명령, 실패/성공 결과, 잔여 리스크를 `/work` 형식에 맞춰 정리했습니다.

## 변경 이유
- public API provider가 `ok=true` mock fallback을 live 성공처럼 보이게 할 수 있어, 성공 응답의 출처와 degraded 상태를 구조화해야 했습니다.
- FX/주택 route와 데이터 소스 ping/UI가 provider meta를 버리면 운영자가 live/cache/mock 상태를 구분할 수 없었습니다.
- 계산·추천 경로가 public API 결과를 쓰는 경우 `ok=true`만으로 핵심 판단 근거를 삼지 않도록 문서 계약이 필요했습니다.

## 핵심 변경
- `PublicApiResult` 성공 응답에 `meta.provenance`를 필수화하고 `mode=live|cache|mock`, `degraded`, `degradedReason`을 추가했습니다.
- FX/주택 provider의 mock fallback은 `(mock)` 문자열 대신 `meta.provenance.mode=mock`과 `degradedReason`으로 표시합니다.
- key missing, upstream 500, timeout, fallback disabled를 회귀 테스트로 분리했고 fallback disabled는 `CONFIG` 오류를 보존합니다.
- FX/주택 공개 route는 cache key를 `v2`로 올려 provenance 포함 payload를 저장하고, 과거 payload는 `legacy-cache` provenance로 읽습니다.
- dev sample, data-source ping, ping summary UI는 provider provenance를 전달하고 degraded 결과를 `주의`로 표시합니다.
- 운영 문서에 `ok=true` 해석 금지, 계산·추천 live-only 기본 계약, cache 호환/rollback 기준을 추가했습니다.

## 검증
- `corepack pnpm test tests/public-api-provenance.test.ts`:
  - 수정 전 7개 테스트 실패 확인.
  - 수정 후 8개 테스트 PASS.
- `corepack pnpm test tests/public-api-provenance.test.ts tests/housing-provider.test.ts tests/public-apis-sample-molit.test.ts tests/data-source-impact-ping.test.ts tests/data-source-impact-health.test.ts tests/data-sources-status.test.ts tests/env-doctor.test.ts tests/schema-drift-safe-error.test.ts`:
  - 8개 파일, 26개 테스트 PASS.
- `corepack pnpm typecheck`: PASS.
- `corepack pnpm lint`: PASS.
- `corepack pnpm build`: PASS.
- `corepack pnpm test`: 732개 파일, 2414개 테스트 PASS.
- `corepack pnpm e2e:rc:data-sources`: PASS.
- `corepack pnpm live:smoke`: 2회 실행, 둘 다 FAIL.
  - FINLIFE deposit smoke PASS.
  - FINLIFE saving smoke FAIL: `HTTP ERR err_cd=TIMEOUT msg=timeout(10000ms)`.
  - DATAGO KDB smoke PASS.
  - 생성 artifact: `artifacts/live-verify-20260628-193104.json`, `artifacts/live-verify-20260628-193126.json`.
- 운영 inventory:
  - `.env.local` 기준 `MOLIT_SALES_API_KEY`, `MOLIT_SALES_API_URL`, `MOLIT_RENT_API_KEY`, `MOLIT_RENT_API_URL`, `FINLIFE_API_KEY`, `DATABASE_URL` 존재.
  - `.env.local` 기준 `KEXIM_API_KEY`, `KEXIM_FX_API_URL`, `PUBLIC_APIS_FALLBACK_TO_MOCK`, `API_CACHE_STORE`, `API_FILE_CACHE_DIR`, `DATAGO_KDB_API_KEY` 미확인.
  - 최종 시점 `tmp/api-cache` 파일 수 0개.

## 남은 리스크
- `live:smoke`는 FINLIFE 적금 upstream timeout으로 실패했습니다. 이번 코드 변경과 직접 연결된 실패 증거는 없지만, 최종 통합 gate에서는 재시도 또는 upstream 상태 확인이 필요합니다.
- public FX route의 KEXIM live 경로는 로컬 `.env.local`에 키가 없어 live 호출로 검증하지 못했고, 장애 주입 테스트와 mock/degraded 경로로 검증했습니다.
- cache migration은 별도 실행 대상이 없습니다. rollback은 코드 되돌림과 `tmp/api-cache` 삭제로 충분하며, quarantine 대상 legacy 소유자 데이터는 이번 변경 범위에 없습니다.
