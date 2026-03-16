# Release Notes

## Latest
### 2026-03-16 (v1.0.4)
### 변경 요약
- Planning v2 후속 정리 버전 `v1.0.4` 준비를 위해 패키지 버전과 릴리즈 스크립트 버전 파라미터를 `1.0.4`로 맞췄습니다.
- 공식 사용자 화면의 밝은 톤 정리를 마감하고, 홈·추천·혜택·알림·기업 탐색·플래닝 리포트에 남아 있던 영문 라벨과 내부 값 노출을 한글 중심으로 정리했습니다.
- `/planning/reports` 상품 후보 비교표의 계산 근거를 셀 내부 확장에서 가운데 오버레이로 바꿔 읽기 흐름이 끊기지 않도록 개선했습니다.
- `/planning` 부채·목표 입력 카드의 폭 정렬 문제를 수정해 입력칸이 좁은 폭에서 밀리거나 겹치지 않도록 맞췄습니다.
- `analysis_docs/**` 정적 분석 문서 세트를 현행 기준으로 재검증하고, 화면 정의·DTO/API·QA·운영 메모까지 정리했습니다.

### 사용자 영향
- 공식 사용자 화면의 읽기 경험이 좋아졌습니다.
- 리포트 비교표에서 계산 근거를 표 흐름을 깨지 않고 확인할 수 있어 가독성이 좋아졌습니다.
- `/planning` 부채·목표 입력 카드의 폭 정렬이 안정돼 입력이 덜 흔들립니다.

### 기술/운영 메모
- public UI tone cleanup 완료 상태를 이번 릴리즈 기준선에 반영했습니다.
- `analysis_docs`는 기준 문서 세트와 운영 메모를 갖춘 정적 분석 자산으로 정리됐습니다.

### 주의사항
- 이번 릴리즈는 UI polish, 문서 정비, copy 정리 중심입니다.
- API 계약이나 계산 로직의 대규모 변경을 포함한 릴리즈는 아닙니다.

## Previous
### 2026-03-02 (v1.0.3)
### 변경 요약
- Planning v2 릴리즈 문서를 `docs/releases/planning-v2-1.0.3.md`로 추가했습니다.
- README 상단 버전을 `v1.0.3`으로 갱신했습니다.
- 패키지 버전을 `1.0.3`으로 상향했습니다.
### 2026-02-26 (v1.0 RC Lock: P45~P50)
### 변경 요약
- P45: `daily_refresh_result.json` reader/API + 대시보드 카드로 마지막 자동 갱신 상태 노출.
- P46~P48: artifacts 뷰어/복사/다운로드/Quick Actions를 메인·대시보드에서 바로 사용 가능하도록 정리.
- P49: `onlyDev` 공통 차단으로 `/api/dev/*` production 404 일괄 적용 + CI `pnpm build` 게이트 추가.
- P50: 네비/홈 동선을 `/dashboard` 중심으로 정리하고, 홈 바로가기를 핵심 5개로 축소.
- P50: `/dashboard/artifacts`, `/debug/unified`, `/dev/*`를 production 404로 고정하고 E2E/CI를 RC 기준으로 잠금.

### 변경 파일(핵심)
- `src/lib/dev/onlyDev.ts`
- `src/app/api/dev/**/route.ts`
- `src/app/dev/**/page.tsx`
- `src/app/debug/unified/page.tsx`
- `src/app/dashboard/artifacts/page.tsx`
- `src/components/DebugUnifiedClient.tsx`
- `src/components/DashboardArtifactsClient.tsx`
- `src/components/SiteHeader.tsx`
- `src/components/brand/BrandLogo.tsx`
- `src/app/page.tsx`
- `src/app/products/page.tsx`
- `tests/e2e/smoke.spec.ts`
- `tests/e2e/dart-flow.spec.ts`
- `playwright.config.ts`
- `.github/workflows/e2e-smoke.yml`
- `.github/workflows/ci.yml`
- `docs/current-screens.md`
- `docs/deploy.md`

### 게이트 결과
- `pnpm verify`: PASS
- `pnpm build`: PASS
- `pnpm e2e`: PASS (7 passed, 2 skipped)
- `pnpm e2e:rc`: PASS (7 passed)

### 2026-02-25 (P2 Unified Catalog 승격)
### 변경 파일
- `docs/unified-catalog-contract.md`
- `src/lib/sources/unified.ts`
- `src/lib/sources/unifiedEnrichPolicy.ts`
- `src/app/api/products/unified/route.ts`
- `src/app/products/catalog/page.tsx`
- `src/app/products/page.tsx`
- `docs/current-screens.md`
- `tests/unified-contract.test.ts`
- `tests/unified-mode-validation.test.ts`
- `tests/unified-dedup-stability.test.ts`

### 변경 요약
- `/api/products/unified` 계약 문서를 추가하고 `stableId`, options 정렬, tie-break 불변식을 명시했습니다.
- merged 모드에서 dedup key를 고정하고(FINLIFE `fin_prdt_cd` 우선), 동일 term options 병합 규칙을 코드로 고정했습니다.
- merged 다중소스에 cursor 페이지네이션을 연결하고, integrated 제약( finlife 필수 / cursor 금지 )은 그대로 유지했습니다.
- 사용자용 `/products/catalog` 페이지를 추가해 `kind/termMonths/minRate/q` 필터 + 결과 리스트 + `meta.generatedAt` 표시를 제공했습니다.
- 제품 메인(`/products`)에 통합 탐색 진입 카드를 추가했습니다.

### 검증
- `pnpm test -- tests/unified-contract.test.ts tests/unified-mode-validation.test.ts tests/unified-dedup-stability.test.ts`
- `pnpm verify`

### 2026-02-25 (Day1~Day6 Release Candidate)
### Day1~Day6 변경 파일 목록
- Day1 화면/링크 정합성
  - `docs/current-screens.md`
  - `src/app/products/page.tsx`
  - `src/app/products/pension/page.tsx`
- Day2 플래너 액션 딥링크
  - `src/lib/planner/types.ts`
  - `src/lib/planner/compute.ts`
  - `tests/planner-compute.test.ts`
- Day3 추천 저장+비교(diff) 및 상세 연결
  - `src/app/recommend/page.tsx`
  - `src/lib/recommend/types.ts`
  - `src/lib/recommend/score.ts`
- Day4~Day5 외부 API 에러 표준/디버그 분리
  - `src/lib/http/apiError.ts`
  - `src/app/api/public/exchange/route.ts`
  - `src/app/api/gov24/sync/route.ts`
  - `src/app/api/gov24/detail/route.ts`
  - `src/app/api/gov24/simple-find/route.ts`
  - `src/lib/finlife/types.ts`
  - `src/lib/finlife/productsHttp.ts`
  - `tests/external-api-error-contract.test.ts`
  - `tests/http-api-error.test.ts`
  - `tests/finlife-http-error-debug.test.ts`
- Day6 오프라인 수동 검증 고정
  - `docs/day6-offline-qa.md`
  - `scripts/offline_doctor.mjs`
  - `package.json`

### 작업 요약 (5줄)
- 정합성: 실제 라우트 기준으로 `current-screens`를 갱신하고 `/products/pension` 카탈로그를 반영했습니다.
- 딥링크: `/planning` 우선순위 액션에서 추천/대출 페이지로 즉시 이동하는 CTA를 `links[]`로 표준화했습니다.
- 저장+diff: `/recommend` 결과를 로컬 저장하고 직전 실행 대비 순위/금리/기간 변화를 카드에서 비교 표시하도록 고정했습니다.
- 에러표준: 환율/GOV24/FINLIFE 실패 응답을 `{ ok:false, error:{ code, message, debug? } }`로 통일했습니다.
- 오프라인 QA: `offline:doctor`와 Day6 문서로 스냅샷/DB/REPLAY 준비상태를 빠르게 재현·진단 가능하게 했습니다.

### pnpm verify 결과
- 로컬 `pnpm verify` 통과 (2026-02-25 실행).
- 검증 게이트: `validate:dumps:fixtures + lint + typecheck + test` 모두 성공.
- CI도 동일하게 `pnpm verify`를 기준 게이트로 사용합니다.

### 남은 TODO / 리스크 (확장 전)
- 추천의 `depositProtection`은 현재 `unknown` 기본값이며 `matched` 판정 로직은 확장 전 구현이 필요합니다.
- FINLIFE HTTP 레이어의 `buildMockPayload`는 현재 미사용 경고 상태라 다음 정리 배치에서 제거/통합이 필요합니다.
- 기본 브랜치 병합에서 verify 강제는 문서화 완료 상태이며 실제 보호 규칙 운영 점검이 필요합니다.

---

### 변경된 파일 목록
- `src/lib/publicApis/odcloud.ts`
- `src/lib/publicApis/providers/benefits.ts`

### 주제 칩 기반 검색 UX 설명 (5줄)
- 원인: 보조금24(ODcloud gov24) 업스트림을 v3로 고정하지 않으면 serviceList 스키마(totalCount/data 등)와 불일치가 발생하고, 인증 fallback 오탐이 겹치며 동기화 실패로 이어질 수 있었습니다.
- 해결: 보조금24(ODcloud gov24) 엔드포인트를 v3로 고정해 serviceList 스키마(totalCount/data 등)와 정합을 맞췄습니다.
- 해결: 인증 실패 판정(looksLikeAuthError)을 HTTP 상태코드(401/403) 기반으로 축소해 2xx 응답을 인증 실패로 오탐하던 문제를 제거했습니다.
- 해결: 비-2xx에서만 제한적으로 본문 키워드를 참고하도록 바꿔, 메시지/HTML에 “인증” 문구가 포함된 정상 응답이 버려지지 않게 했고 인증 실패 시 상태코드가 메시지에 포함되어(sync/debug) 원인 추적이 쉬워졌습니다.
- 결과: /api/gov24/sync가 502에서 벗어나 정상 200으로 동작하며, 동기화 메타(completionRate/uniqueCount/upstreamTotalCount/hardCapPages/effectivePerPage)를 안정적으로 제공합니다.

### pnpm test / pnpm lint 결과
- `npm test -- tests/odcloud-auth-fallback.test.ts tests/odcloud-resolver.test.ts`: 통과 (2 files, 5 tests)
- `/api/gov24/search`: 200 확인
- `/api/gov24/sync`: 200 확인

### 남은 TODO / 리스크
- 업스트림이 429(rate limit) 또는 5xx를 반환하는 경우 백오프/재시도 정책이 필요할 수 있습니다.
- v3 스키마가 변형될 경우(키명 변경) id/totalCount/rows 추출 로직은 추가 보강이 필요합니다.
- 동기화 완주율(95%+)은 hardCapPages 설정에 영향을 받으므로 환경별 튜닝이 필요합니다.
- 다음 단계 체크리스트: 데이터 품질(누락/중복/정규화 지표), 상세 탭(출처/자격/신청방법 표시 규격), 카드 UI(메타 노출 우선순위/반응형 밀도/가독성) 작업을 순차 진행합니다.

---

### 변경된 파일 목록
- `src/lib/publicApis/contracts/types.ts`
- `src/lib/publicApis/benefitsTopics.ts`
- `src/lib/publicApis/benefitsTopicMatch.ts`
- `src/lib/publicApis/benefitsSearchView.ts`
- `src/app/api/public/benefits/search/route.ts`
- `src/components/BenefitsClient.tsx`
- `src/components/RecommendHubClient.tsx`
- `src/lib/recommend/scoreBenefits.ts`
- `tests/benefits-mode-all-compat.test.ts`
- `tests/recommend-benefits-score.test.ts`
- `tests/benefits-topics-match.test.ts`
- `tests/benefits-search-topics-param.test.ts`

### 주제 칩 기반 검색 UX 설명 (5줄)
- `/benefits` 기본 화면에서 자유 텍스트 입력을 제거하고, 주거/청년/출산/취업/교육/의료/전세/월세 주제 칩 8개를 기본 검색 진입점으로 변경했습니다.
- 주제 칩은 다중 선택이며 클릭 즉시 API 재요청되어 결과가 갱신됩니다(`topics` 파라미터).
- 텍스트 검색은 “고급 검색 펼치기” 안으로 이동해 선택적으로만 사용하도록 했습니다.
- 결과 카드에 `매칭:` 한 줄을 추가해 어떤 주제가 어떤 필드(제목/요약/조건/신청방법/기관)에서 매칭됐는지 표시합니다.
- `/recommend` 혜택 탭도 동일한 주제 칩 + 고급 검색 구조로 통일하고, 점수 계산도 카테고리/키워드 대신 주제/고급검색 기반으로 반영했습니다.

### pnpm test / pnpm lint 결과
- `pnpm test`: 통과 (63 files, 111 tests passed)
- `pnpm lint`: 통과

### 남은 TODO / 리스크
- 동의어 사전은 보수적으로 시작했으므로 실제 운영 데이터 기반으로 확장/튜닝이 필요합니다.
- 주제 간 겹침(예: 주거 vs 전세/월세, 교육 vs 취업훈련)은 의도된 중첩이며, 우선순위/가중치 정책은 추가 설계 여지가 있습니다.
- API는 `topicMode=and`를 지원하지만 UI는 현재 OR 기본만 노출합니다(AND 토글을 붙일지 추후 결정 가능).

---

## Template
### 변경된 파일 목록
- `path/to/file1`
- `path/to/file2`

### 주제 칩 기반 검색 UX 설명 (5줄)
- 
- 
- 
- 
- 

### pnpm test / pnpm lint 결과
- `pnpm test`: 
- `pnpm lint`: 

### 남은 TODO / 리스크
- 
- 
- 
