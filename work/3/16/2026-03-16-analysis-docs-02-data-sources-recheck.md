# 2026-03-16 analysis_docs 02 data-sources 재검증

## 변경 파일
- `analysis_docs/02_화면정의서.md`

## 사용 skill
- `route-ssot-check`: `/settings/data-sources`가 현재 실존 경로인지 `docs/current-screens.md`와 함께 다시 확인하는 용도
- `work-log-closeout`: 이번 라운드 `/work` 기록 형식과 검증/남은 쟁점 정리를 저장소 관례에 맞추는 용도

## 변경 이유
- `analysis_docs/02_화면정의서.md`의 `SCR-15` data-sources 연계 API 설명에 `[검증 필요]`가 남아 있었고, 실제 페이지가 어떤 서버 helper와 어떤 status/ping/build route를 쓰는지 다시 확인할 필요가 있었습니다.
- 이번 라운드는 data-sources 설명 1건만 재검증하고, 확정 가능한 사실만 문서에 반영하는 것이 목적이었습니다.

## 무엇을 확인했는지
- `docs/current-screens.md`에서 `/settings/data-sources`가 현재 public 화면으로 유지되는지 확인했습니다.
- `src/app/settings/data-sources/page.tsx`를 읽어 초기 렌더링이 `getDataSourceStatuses`, `loadDataSourceImpactSnapshot`, 사용자 영향/확장 helper를 기준으로 이루어지는지 확인했습니다.
- `src/components/DataSourceStatusCard.tsx`, `src/components/DataSourceImpactCardsClient.tsx`, `src/components/DataSourceHealthTable.tsx`, `src/components/OpenDartStatusCard.tsx`를 읽어 recent ping, `운영 최신 기준`, OpenDART 상태/인덱스 생성, production read-only 처리 방식을 확인했습니다.
- `src/app/api/data-sources/status/route.ts`, `src/app/api/sources/status/route.ts`, `src/app/api/dev/data-sources/ping/route.ts`, `src/app/api/dev/data-sources/health/route.ts`, `src/app/api/public/disclosure/corpcodes/status/route.ts`, `src/app/api/public/disclosure/corpcodes/build/route.ts`를 읽어 실제 연결 가능한 API를 대조했습니다.
- `tests/e2e/data-sources-settings.spec.ts`에서 `운영 최신 기준`, `검색 인덱스 생성|검색 인덱스 없음`, `연결 테스트` 반영이 실제로 검증 대상인지 확인했습니다.

## 무엇을 고쳤는지
- `SCR-15`의 연계 API 문장에서 `[검증 필요]`를 제거했습니다.
- 초기 화면은 서버에서 `getDataSourceStatuses`와 `loadDataSourceImpactSnapshot`으로 렌더링하고, OpenDART 카드는 `/api/public/disclosure/corpcodes/status`를 조회한다는 점을 반영했습니다.
- dev에서만 `/api/dev/data-sources/ping`, `/api/dev/data-sources/health`, `/api/public/disclosure/corpcodes/build`가 붙고, production에서는 상세 진단 대신 `운영 최신 기준` read-only만 보여준다는 점을 문서에 적었습니다.

## 끝까지 확정 못 한 항목
- 없음. 이번 라운드 범위인 `SCR-15` 연계 API 설명은 현재 저장소 기준으로 확정 가능한 범위까지 반영했습니다.
- `analysis_docs/02_화면정의서.md`의 다른 화면 설명은 이번 범위 밖이라 건드리지 않았습니다.

## 검증
- `git diff --check -- analysis_docs/02_화면정의서.md`
- `git diff --no-index --check -- /dev/null analysis_docs/02_화면정의서.md`

## 다음 우선순위
- 이번 라운드 범위는 종료. 후속 라운드가 열린다면 `analysis_docs` 남은 문서 중 새로 생긴 `[검증 필요]`만 별도 배치로 다루는 편이 안전합니다.
