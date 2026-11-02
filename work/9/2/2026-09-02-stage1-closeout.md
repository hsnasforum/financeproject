# 2026-09-02 Stage 1 종료 보완

## 변경 파일

- 삭제·복원 UI 검증: `tests/e2e/planning-destructive-confirmation.spec.ts`, `tests/e2e/helpers/e2eTest.ts`
- FX 일반화·KST: `src/lib/publicApis/providers/fx.ts`, `tests/exim-exchange-normalize.test.ts`, `tests/public-api-provenance.test.ts`, `tests/e2e/fx-freshness.spec.ts`
- 목표 개월 수 저장·재열기: `tests/planning/ui/targetMonthInput.test.ts`, `tests/planning/ui/profileFormModel.test.ts`
- 브라우저 설정 백업: `src/lib/backup/backupBundle.ts`, `src/components/BackupClient.tsx`, `tests/browser-settings-backup.test.ts`
- 상품 필터·pagination: `src/lib/sources/unifiedTypes.ts`, `src/lib/sources/unifiedLoaders.ts`, `src/lib/sources/unified.ts`, `src/app/api/products/unified/route.ts`, `src/lib/products/catalogExplorer.ts`, `src/app/products/catalog/page.tsx`, 관련 catalog·route·loader 테스트
- Gov24 lifecycle: `tests/e2e/gov24-request-lifecycle.spec.ts`, `tests/e2e/helpers/e2eTest.ts`
- clean checkout·기록: `config/data-freshness-exceptions.json`, `.gitignore`, `work/9/1/2026-09-01-stage1-accuracy-safety.md`, `docs/data-freshness-report.md`

## 사용 skill

- `finance-skill-routing`: Stage 1 종료에 필요한 저장소 skill만 선택했습니다.
- `planning-gate-selector`: 변경 영역별 타깃 테스트와 최종 test·lint·build·E2E 게이트를 정했습니다.
- `dart-data-source-hardening`: FX·상품 source의 provenance, freshness, partial failure와 fallback 표시를 점검했습니다.
- `work-log-closeout`: 실제 변경·검증·잔여 위험을 이 표준 형식으로 기록했습니다.

## 변경 이유

- 1-1~1-7은 helper 또는 일부 경로만 검증돼 실제 DOM, 저장 재열기, provider 전체 발견, 요청 취소와 비용 상한 증거가 부족했습니다.
- 브라우저 설정 읽기 예외가 `null` 삭제 지시로 바뀔 수 있었고, FX fallback 날짜에 UTC 날짜 절단이 남아 있었습니다.
- canonical freshness 예외 파일과 여러 로컬 모듈이 미추적이라 clean checkout과 CI 변경 묶음 재현성이 보장되지 않았습니다.

## 핵심 변경

- 프로필·실행 기록·휴지통 다이얼로그에서 빈 값, 오입력, 정확한 입력, 닫기·재열기·대상 변경 초기화와 요청 1회를 실제 브라우저 DOM·API로 검증했습니다.
- 일반 `ABC(N)` 환율 단위와 KST 자정 경계를 보강하고 FX 날짜 fallback을 공통 KST helper로 통일했습니다.
- `targetMonth`를 입력에서 저장 payload, 저장 record, 시각 변경 후 hydrate와 입력 재표시까지 상대 개월 수로 검증했습니다.
- 브라우저 설정 읽기 실패 시 bundle 생성과 다운로드를 중단하고 실패 키를 `null`로 저장하지 않도록 했습니다.
- 상품 provider facet을 현재 page와 분리하고 가능한 DB 필터를 push-down했습니다. 나머지는 source별 20 page·20,000개 결과 상한, abort 전파, partial 표시와 2분 filtered snapshot cursor로 제한했습니다.
- Gov24의 syncing polling, ready 종료, hidden/visible, unmount abort, stale status·search 무시를 통제된 브라우저 요청으로 검증했습니다.

## 검증

- `corepack pnpm exec vitest run tests/ops-confirm.test.ts tests/exim-exchange-normalize.test.ts tests/public-api-provenance.test.ts tests/kst-calendar-date.test.ts tests/fx-data-status.test.ts tests/planning/ui/targetMonthInput.test.ts tests/planning/ui/profileFormModel.test.ts tests/browser-settings-backup.test.ts tests/unified-source-loaders.test.ts tests/finlife-unified-only-new-evidence.test.ts tests/products-unified-route.test.ts tests/catalog-explorer.test.ts tests/benefits-gov24-flow-contract.test.ts tests/data-freshness-report.test.ts tests/housing-afford.test.ts tests/housing-afford-ui.test.tsx tests/recommend-weights.test.ts tests/recommend-score.test.ts`: PASS, 18 files·121 tests
- `corepack pnpm typecheck`: PASS
- `corepack pnpm freshness:release`: PASS (`total=8`, `exceptions=8`, `missing=0`, `invalid=0`)
- `corepack pnpm test`: PASS, 890 files·3,516 tests, 4 skipped
- `corepack pnpm lint`: PASS
- `corepack pnpm build`: PASS, Next production build·254 static pages
- `PORT=3155 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm exec playwright test tests/e2e/planning-destructive-confirmation.spec.ts tests/e2e/gov24-request-lifecycle.spec.ts tests/e2e/fx-freshness.spec.ts tests/e2e/products-list-query.spec.ts --workers=1`: PASS, 14 tests
- `PORT=3156 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm exec playwright test tests/e2e/planning-destructive-confirmation.spec.ts --grep "profile delete" --workers=1`: 같은 대상 닫기·재열기 초기화 단언 추가 후 PASS, 1 test
- `corepack pnpm exec eslint tests/e2e/helpers/e2eTest.ts tests/e2e/fx-freshness.spec.ts tests/e2e/planning-destructive-confirmation.spec.ts`: PASS
- `corepack pnpm exec eslint tests/e2e/planning-destructive-confirmation.spec.ts`: 최종 assertion 추가 후 PASS
- 임시 clean-room에서 현재 tracked diff만 적용한 `corepack pnpm data:doctor`: 예외 파일 부재로 의도한 FAIL, `config/data-freshness-exceptions.json`만 복사 후 PASS (`total=8`, `exceptions=8`, `missing=0`, `invalid=0`)
- `git diff --check`: 범위 밖 기존 `AGENTS.md:3` 후행 공백으로 FAIL. Stage 1 tracked 파일을 명시한 `git diff --check -- <Stage 1 paths>`는 PASS했고, Stage 1 untracked 파일의 후행 공백 검색 결과는 0건입니다.

## 남은 리스크

- `config/data-freshness-exceptions.json`과 Stage 1 신규 source·test가 여전히 미추적입니다. 따라서 1-10 판정은 `부분 확인 — Git 포함 대기`이며, 실제 변경 묶음에 포함한 clean checkout CI 통과 전에는 Stage 1 전체 승인으로 올릴 수 없습니다.
- 현재 tracked 파일에서 재귀적으로 도달하는 미추적 로컬 source가 47개입니다. 이 중 다수는 기존 Working Tree의 Stage 2·3 또는 운영 변경으로 보이며 이번 작업에서 수정하지 않았으므로, 별도 귀속 검토 없이 한꺼번에 포함하면 안 됩니다.
- 상품 filtered snapshot은 프로세스 메모리에서 2분·최대 128개로 유지됩니다. 재시작 또는 만료 뒤 cursor는 재조회가 필요하고, source별 20 page·20,000개 상한을 넘으면 UI가 부분 결과임을 표시합니다.
- 외부 API 실자격 증명과 실제 upstream 변형은 실행하지 않았습니다. FX·Gov24·상품 검증은 fixture, mock, 저장 source 경계까지입니다.
- 전체 diff의 기존 `AGENTS.md:3` 후행 공백은 사용자 변경 보존 원칙에 따라 수정하지 않았습니다.
- 1-8 주거비와 1-9 추천 가중치 정책은 변경하지 않고 회귀 테스트만 유지했습니다. Stage 2·3 기능은 새로 구현하지 않았습니다.
