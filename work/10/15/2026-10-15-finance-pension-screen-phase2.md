# 2026-10-15 Finance 연금저축 원천 교체 2단계 (연금 화면·API, FINLIFE 연금 실행 경로 정리)

기준: [1단계](2026-10-15-finance-pension-source-phase1.md). branch `checkpoint/finance-review-20261011`, HEAD `4f7152c0`.

## 결과

- `/products/pension`을 통합연금포털 스냅샷 전용 화면으로 바꿨습니다. 기본 탭은 원리금보장 연금저축보험(44개, 2026년 9월), 두 번째 탭은 상품별 수익률·수수료율(4,373개, 2026년 2분기)이며 판매 중·연평균 수수료율 낮은 순이 기본입니다.
- 새 공개 GET `/api/products/pension`이 스냅샷을 검증해 읽고 거르기·정렬·쪽 나누기와 신선도를 계산합니다. 실행 중에는 통합연금포털을 호출하지 않습니다.
- 화면은 출처 "통합연금포털(금융감독원) 콘텐츠"와 자료별 원문 링크, 공시 기준·수집 시각, 오래된 자료·기준 지연·미공시 분기, 스냅샷 없음/손상, 빈 결과를 각각 구분해 보여 줍니다.
- FINLIFE 연금 실행 경로를 정리했습니다: `GET /api/finlife/pension` 삭제, `FinlifeKind`에서 `pension` 제거, 연금 필드 설정·설명·dev 도구 목록 정리. 저장된 Prisma 연금 행을 읽는 identity 규칙과 SQLite identity 마이그레이션은 그대로 둡니다.
- 비교·상세에 남은 `finlife:pension:*` id는 `GET /api/products/unified/item`이 410 `PRODUCT_RETIRED`로 거부하고, 화면은 "이전 데이터 제공 종료"와 새 화면 링크를 보여 줍니다. 연금 화면은 비교함·즐겨찾기를 지원하지 않는다고 안내합니다.

## 변경 파일

- 신규: `src/app/api/products/pension/route.ts`, `src/components/products/PensionProductsClient.tsx`, `src/lib/products/pensionSnapshots.ts`, `src/lib/products/pensionQuery.ts`, `src/lib/products/pensionOptions.ts`, `src/lib/publicApis/providers/fssPension.d.mts`, `tests/pension-products-query.test.ts`, `tests/pension-products-route.test.ts`
- 삭제: `src/app/api/finlife/pension/route.ts`
- 수정(연금 원천·화면): `src/lib/publicApis/providers/fssPension.mjs`(스냅샷 파일명·스키마 버전·7일 기준·자료별 원문 링크를 한곳으로), `scripts/fss_pension_sync.mjs`, `scripts/data_freshness_report.mjs`, `src/app/products/pension/page.tsx`, `src/app/products/page.tsx`, `src/lib/http/publicApiDiagnostics.ts`
- 수정(FINLIFE 연금 정리·제공 종료): `src/lib/finlife/{types,apiSchema,fetchLive,fieldConfig,glossary}.ts`, `src/app/api/finlife/availability/route.ts`, `src/app/api/dev/finlife/schema-report/route.ts`, `src/components/{DevDataDashboardClient,FinlifeSchemaReportClient,UnifiedProductDetailClient}.tsx`, `src/lib/sources/{unified,unifiedTypes,types}.ts`, `src/app/api/products/unified/item/route.ts`, `src/app/products/compare/page.tsx`, `src/lib/helpContent.ko.ts`
- 문서: `docs/fss-pension-openapi.md`, `docs/current-screens.md`, `docs/api-utilization-draft.md`
- 테스트: 연금 예시로 쓰던 단위 테스트 7개를 다른 상품군으로 옮김(`product-list-provenance-copy`, `product-query-controller(-hook)`, `product-list-data-request`, `product-list-data-hook`, `finlife-schema-report`, `finlife-product-route-gateway`), 제공 종료 케이스 추가(`unified-item-route`, `finlife-unified-identity-consumers`), `tests/e2e/products-list-query.spec.ts`의 연금 목록 E2E 3건을 주택담보대출로 옮기고 연금 화면 E2E 3건 추가

## 사용 skill

- 별도 skill 없이 AGENTS.md의 화면·외부 데이터·단일 기준점 규칙을 따랐습니다. 사용처 조사는 탐색 에이전트에 맡겼고, 공식 필드 의미·단위는 앱 내장 브라우저로 통합연금포털 개발 가이드와 공시 화면에서 확인했습니다.

## 변경 이유와 핵심 결정

- 공식 화면 기준: 적립금 단위 백만원, 연평균 수익률은 과거 N년 기간수익률 연환산(수수료 차감 후), 연평균 수수료율은 보수·비용 합÷납입금 합, 수수료 부과구조는 `|`로 계약체결비용·계약관리비용을 나눔, 판매채널은 설계사·대리점·온라인입니다. 원리금보장 보험은 수수료를 먼저 떼므로 초기 적립금이 낸 돈보다 적을 수 있다는 공식 유의 문구를 화면에 둡니다.
- 공시값은 반올림하지 않고(소수 셋째 자리까지) 이상치도 그대로 보여 주되, 연평균 수수료율이 음수인 상품(1건)에는 원문 확인 안내를 붙입니다. 정렬 값이 없는 상품은 방향과 무관하게 맨 뒤이며 건수를 표시합니다.
- 원리금보장 탭 기본 정렬은 순위를 암시하지 않도록 회사·상품명 순으로 두고 공시이율 순은 선택지로 둡니다(가정). 상품별 탭은 설계대로 수수료율 낮은 순입니다.
- 신선도: 수집 기록이 7일을 넘으면(freshness:release와 같은 경계) 오래된 자료, 상품별은 KST 최근 완료 분기보다 2분기 이상, 원리금보장은 6개월 이상 뒤처지면 기준 지연으로 표시합니다.
- 스냅샷 없음은 기존 benefits와 같은 409 `SNAPSHOT_MISSING`(공개 진단 코드 사용), 구조 손상은 500 `SNAPSHOT_INVALID`입니다. 운영 명령은 공개 메시지에 넣지 않습니다.
- 1단계 스냅샷의 `source.url`이 판매회사별 적립금 화면을 가리켜, 이후 수집부터 자료별 공시 화면 링크를 기록하도록 고쳤습니다. 화면은 저장된 값 대신 `FSS_PENSION_PAGES`를 씁니다. 커밋된 스냅샷 파일은 다음 수집 때 갱신됩니다.

## 검증

- 깨끗한 HEAD 사본 + 이번 변경(사용자 `work/10/10` 수정 제외), bwrap·네트워크 차단:
  - 전체 `tsc --noEmit` 통과, 변경 파일 eslint 오류 0(기존 `window.location.href` 경고 3).
  - 관련 단위 테스트 26파일 123건 통과. 전체 vitest 933파일 중 928 통과, 실패 25건은 이전과 같은 sandbox 전용 목록(owner restore 20, owner archive 2, news 2, reports-route 1).
  - `tests/e2e/products-list-query.spec.ts` dev 모드 13건 통과(옮긴 3건, 연금 화면·스냅샷 없음·비교 제공 종료 3건 포함).
  - Playwright 화면 확인(1280×900, 390×844): 두 탭, 수수료 부과구조 펼침, 출처·기준·미공시 안내, 음수 수수료 안내. 모바일 가로 넘침은 긴 상품명 줄바꿈을 고친 뒤 0px.
- production 모드 `e2e:release:contracts`와 실제 운영 앱에서의 확인은 이번 라운드에서 실행하지 않았습니다(CI `release:verify`에서 실행).

## 남은 리스크

- 커밋된 스냅샷은 2026-10-15 수집분이라 2026-10-22 이후 수집되지 않으면 화면에 오래된 자료로 표시되고 `freshness:release`가 막힙니다. 일일 갱신의 연금 단계는 PR #301이 main에 병합된 뒤부터 실행됩니다.
- 2026년 3분기 상품별 자료는 수집 시점에 미공시였습니다. 공시 시점은 미확인입니다.
- 기존 즐겨찾기에 남은 연금 id는 어디에도 표시되지 않습니다(정리 버튼 없음). 비교함의 연금 id는 제공 종료로 표시되며 사용자가 직접 뺄 수 있습니다.
- `SegmentedTabs`는 선택 상태를 보조기기에 알리는 속성이 없습니다(기존 공통 컴포넌트).

## 다음 라운드

- PR #301 병합 후 일일 갱신에서 `pension:sync:if-stale` 실제 실행과 스냅샷 갱신 PR 확인.
- 필요하면 즐겨찾기의 연금 id 정리 기능, 데이터 연동 상태 화면에 통합연금포털 원천 추가.
