# Stage 1 정확성·안전성 수정 종료 기록

## 기준점

- 작업 문서: `FINANCE_CODEX_GOAL.md`
- 시작 브랜치/HEAD: `main` / `6a51f8d3a24394ba239838a78c8c19aa590fc180`
- upstream: `origin/main`
- 시작 Working Tree: tracked 변경 235개, untracked 140개, staged 0개
- 실제 명령 경로: Windows UNC cwd에서 `pnpm` 직접 실행이 불가능하여 `/home/xpdlqj/code/finance`를 기준으로 WSL 안에서 `corepack pnpm`을 실행했습니다.
- 기존 변경과 미추적 파일은 reset, checkout, restore, stash, clean, add, commit, push 없이 보존했습니다.

## 변경 이유와 핵심 변경

1. 파괴 작업 확인창의 미리 채운 확인 문자열을 제거하고, 빈 값·오입력·재오픈을 공통 확인 계약으로 검증했습니다.
2. EXIM 통화 단위 `ABC(N)`를 공통 정규화하여 JPY(100)처럼 환율 배수가 있는 통화의 원화 환산을 바로잡았습니다.
3. 상대 개월 수인 `targetMonth`를 달력 날짜로 왕복하지 않고 `N개월 후` canonical 입력으로 유지했습니다.
4. 평문 브라우저 설정 백업은 UI 설정 whitelist만 내보내고, 이전 백업의 민감 키는 적용하지 않으며 적용·제거·무시·실패 건수를 분리했습니다.
5. 상품 기관·기간·최소 금리 필터를 unified 서버 조회, cursor, singleflight key, URL 상태에 포함하고 명시적 조회 한 번만 실행하도록 정리했습니다.
6. Gov24 첫 검색 중복 실행을 제거하고 status polling을 `syncing` 및 visible 상태에서만 실행하도록 제한했습니다.
7. 구독·환율 날짜 계산을 `Asia/Seoul` 공통 달력 helper로 통합했습니다.
8. 주거비 부담 기준을 30% 주의·40% 높음 단일 정책으로 통합하고 UI·경고·CTA에 같은 판정을 사용했습니다.
9. 추천 가중치를 저장·schema·controller·score·API 경계에서 합계 1로 정규화하고 사용자에게 원합계와 보정 여부를 표시했습니다.
10. freshness 예외 경계에 고정 시각 입력을 추가하고, 지원 package script가 canonical 예외 파일을 공유하도록 맞췄습니다. 혜택·Gov24·환율 화면에는 live/cache/mock/unavailable, 기준 시점, 최신 원문 재확인 안내를 노출했습니다.

## 변경 파일

- 확인·플래닝 입력: `src/lib/ops/confirm.ts`, `src/components/PlanningRunsClient.tsx`, `src/components/PlanningTrashClient.tsx`, `src/components/planning/workspace/useWorkspaceProfileBundle.ts`, `src/components/planning/workspace/panels/shared.ts`, `src/components/planning/workspace/panels/profilePanel.tsx`
- 환율·KST: `src/lib/publicApis/providers/exchangeNormalization.ts`, `src/lib/publicApis/providers/exchange.ts`, `src/lib/publicApis/providers/fx.ts`, `src/lib/format/kstCalendarDate.ts`, `src/lib/schemas/subscriptionFilters.ts`, `src/lib/publicApis/providers/subscription.ts`, `src/components/SubscriptionClient.tsx`
- 백업: `src/lib/backup/backupBundle.ts`, `src/components/BackupClient.tsx`
- 상품 카탈로그: `src/lib/sources/unifiedTypes.ts`, `src/lib/sources/unified.ts`, `src/app/api/products/unified/route.ts`, `src/lib/products/catalogExplorer.ts`, `src/app/products/catalog/page.tsx`
- Gov24·혜택: `src/lib/publicApis/benefitsFlowContract.ts`, `src/components/BenefitsClient.tsx`, `src/components/Gov24Client.tsx`
- 주거비: `src/lib/housing/afford.ts`, `src/components/HousingAffordClient.tsx`
- 추천 가중치: `src/lib/recommend/weights.ts`, `src/lib/schemas/recommendProfile.ts`, `src/lib/recommend/recommendPageController.ts`, `src/lib/recommend/score.ts`, `src/lib/recommend/types.ts`, `src/app/api/recommend/route.ts`, `src/app/recommend/page.tsx`
- freshness·문서: `scripts/data_freshness_report.mjs`, `package.json`, `config/data-freshness-exceptions.json`, `docs/data-freshness-report.md`, `docs/package-scripts.md`
- 신규/갱신 검증: `tests/ops-confirm.test.ts`, `tests/browser-settings-backup.test.ts`, `tests/kst-calendar-date.test.ts`, `tests/fx-data-status.test.ts`, `tests/recommend-weights.test.ts`, `tests/housing-afford-ui.test.tsx`, `tests/planning/ui/targetMonthInput.test.ts`, `tests/e2e/products-list-query.spec.ts`, `tests/e2e/gov24-request-lifecycle.spec.ts`, `tests/e2e/fx-freshness.spec.ts`, `tests/e2e/home-hero-carousel.spec.ts`와 관련 route/schema/view-model 계약 테스트

## 사용 skill

- `finance-skill-routing`: 이번 Finance Project 작업에 필요한 최소 skill 조합을 선택했습니다.
- `planning-gate-selector`: 변경 영역별 타깃 검증과 최종 test/lint/build/e2e 게이트를 선택했습니다.
- `dart-data-source-hardening`: 외부·저장 데이터의 freshness, fallback, provenance, 부분 실패 안내를 점검했습니다.
- `playwright`: 저장소 wrapper로 실제 브라우저의 요청 횟수, polling 종료, 환율·혜택 출처 표시를 검증했습니다.
- `work-log-closeout`: 변경 파일, 실행 검증, 잔여 위험을 이 종료 기록 형식으로 정리했습니다.

## 문서와 현재 코드의 충돌

- 1-5의 오래된 응답 덮어쓰기는 현재 코드에 `createLatestRequestCoordinator`가 이미 있어 기존 판단을 유지했습니다. 남아 있던 전체 후보 서버 필터, URL 조건, draft/applied 조회 분리만 수정했습니다.
- 1-7은 문서가 공통 KST 경계를 전제로 했지만 현재 코드는 환율 내부 구현과 여러 로컬 날짜 계산으로 흩어져 있었습니다. 실제 경로를 기준으로 공통 helper를 새로 만들었습니다.
- 1-9는 현재 URL에 가중치 계약이 없었습니다. 문서 요구를 확대해 URL 필드를 발명하지 않고 저장·API·계산 경계만 정규화했습니다.
- 1-10 관련 이전 `/work` 기록은 예외 파일이 포함되고 gate가 닫혔다고 적었지만, 현재 Git에서 `config/data-freshness-exceptions.json`은 미추적입니다. 현재 Git 상태를 우선해 잔여 위험으로 남겼습니다.
- RC E2E의 `저장된 상품 다시 보기` 기대는 현재 명시적 검색 버튼 `조건으로 조회`와 충돌했습니다. Stage 1의 단일 명시적 조회 계약과 실제 화면을 우선해 selector를 갱신했습니다.

## 검증

- 항목별 타깃 Vitest: 확인창, FX 단위, targetMonth, 백업, catalog, Gov24, KST, 주거비, 추천 가중치, freshness/provenance 계약 모두 통과
- `corepack pnpm typecheck`: PASS
- `corepack pnpm freshness:release`: PASS (`total=8`, `fresh=0`, `stale=0`, `exceptions=8`, `missing=0`, `invalid=0`)
- freshness/product/Gov24/FX/release 계약 10개 파일 38개 테스트: PASS
- Gov24·FX 실제 브라우저 3개 테스트: PASS
- `corepack pnpm test`: PASS (890 files, 3,505 passed, 4 skipped)
- `corepack pnpm lint`: PASS
- `corepack pnpm build`: PASS (Next production build, 254 static pages 생성)
- `corepack pnpm e2e:rc`: 최종 PASS (46 passed, 2 skipped)
- Stage 1 대상 `git diff --check`: PASS

## 남은 리스크

- `config/data-freshness-exceptions.json`은 현재 미추적입니다. 현재 Working Tree에서는 gate가 통과하지만, 향후 별도 승인으로 이 파일을 Git에 포함하기 전까지 clean checkout/CI가 같은 canonical 예외 파일을 확보한다고 보장할 수 없습니다.
- 예외 8건은 `2026-09-30T00:00:00.000Z`부터 만료됩니다. 그 전에 저장 스냅샷을 갱신하거나 예외의 필요성을 다시 검토해야 합니다.
- 외부 API 실자격 증명 호출은 하지 않았습니다. EXIM·Gov24·혜택의 실제 upstream 응답 변형은 fixture·mock·저장 snapshot 경계까지만 확인했습니다.
- Stage 2 구조 정리 13개와 Stage 3 UI/UX 항목은 이번 작업에서 구현하지 않았습니다.

## 종료 Git 상태

- 브랜치/HEAD/upstream: `main` / `6a51f8d3a24394ba239838a78c8c19aa590fc180` / `origin/main`
- staged: 0
- 종료 시 `--untracked-files=all` 기준: tracked 변경 263개, untracked 154개
