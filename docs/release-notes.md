# Release Notes

## Latest
### 2026-02-25 (Day1~Day6 기준점)
### 변경된 파일 목록
- `docs/current-screens.md`
- `src/components/SiteHeader.tsx`
- `src/app/page.tsx`
- `src/app/products/page.tsx`
- `src/lib/planner/types.ts`
- `src/lib/planner/compute.ts`
- `src/app/planner/page.tsx`
- `src/app/recommend/page.tsx`
- `src/lib/recommend/resultHistory.ts`
- `src/lib/publicApis/errorContract.ts`
- `src/app/api/public/exchange/route.ts`
- `src/app/api/gov24/search/route.ts`
- `src/lib/finlife/productsHttp.ts`
- `tests/planner-compute.test.ts`
- `tests/recommend-result-history.test.ts`
- `tests/external-api-error-contract.test.ts`

### 이번 주 변경점
- Day1: 현재 제공 화면 카탈로그를 `docs/current-screens.md`로 고정하고, 홈/헤더/제품 페이지 링크 정합성을 점검했습니다.
- Day2: GOV24/환율/FINLIFE의 스키마 드리프트 방어(안전한 에러 + 진단정보) 및 리포트/스냅샷 기반 테스트를 강화했습니다.
- Day3: 플래너 우선순위 액션에 실제 이동 링크를 추가해 추천/상품 탐색으로 바로 연결되도록 개선했습니다.
- Day4: 추천 결과를 localStorage에 저장하고, 이전 실행 대비 순위/금리/신규/이탈 변화 요약을 UI에 노출하도록 확장했습니다.
- Day5: 추천 카드의 badge key 충돌(중복 key 경고) 이슈를 해결했습니다.
- Day6: 외부 API 실패 응답 규격(`ok:false + error.code/message`)을 공통화하고, 입력 오류는 HTTP 400으로 명확히 매핑되도록 정리했습니다.

### pnpm verify / CI 기준
- 로컬 `pnpm verify` 통과 (2026-02-25 실행): `validate:dumps:fixtures + lint + typecheck + test` 모두 성공
- CI 기준: `.github/workflows/ci.yml`의 `Verify` 단계가 동일하게 `pnpm verify`를 실행하도록 유지됨

### 깨진 것 (Known Broken)
- 현재 릴리즈 후보 기준에서 재현되는 Blocker 없음 (`pnpm verify` 통과 기준)
- 단, 외부 업스트림(ODcloud/EXIM/FINLIFE) 장애/스키마 급변 시 `SCHEMA_MISMATCH`/`UPSTREAM` 계열 오류는 발생 가능(의도된 fail-safe)

### 주의사항 (가정값 / 데이터 기준일)
- 플래너/추천 결과는 규칙 기반 시뮬레이션이며 확정 수익/보장을 의미하지 않음(가정값: 비상금 개월수, 고금리 기준 APR, DSR 경고 기준, 금리 선택 정책 등)
- 환율/혜택/상품 데이터는 실시간 보장이 아닌 기준 시점 데이터임:
  - 환율: 응답의 `meta.asOf` / `requestedDate` 기준
  - GOV24: 스냅샷 `generatedAt` 및 `meta.sync.state`(ready/syncing/needs_sync) 확인 필요
  - FINLIFE: `meta.kind/pageNo/topFinGrpNo`와 `mode(live/fixture/mock)` 확인 필요

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
