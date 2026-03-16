# 2026-03-16 analysis_docs 03 DTO API 명세 정비

## 변경 파일
- `analysis_docs/03_DTO_API_명세서.md`

## 이번 배치에서 다룬 문서
- `analysis_docs/03_DTO_API_명세서.md`

## 사용 skill
- `work-log-closeout`: 배치 단위 변경 파일, 실제 검증, 남은 쟁점을 `/work` 형식으로 남기는 데 사용.

## 변경 이유
- `analysis_docs/03_DTO_API_명세서.md`의 공통 API contract 설명과 Unified Catalog 계약이 현재 구현보다 단순하게 적혀 있었습니다.
- `src/app/api/**` 전체 surface는 커졌지만, 이번 배치는 문서 안에서 명확히 오래된 DTO/API 설명만 최소 수정하는 것이 목표였습니다.

## 현행과 달라서 고친 내용
- 공통 계약 원칙에 `src/lib/http/apiContract.ts`, `src/lib/http/apiResponse.ts`, `src/lib/planning/api/contracts.ts`, `src/lib/planning/api/response.ts` 기준의 현재 helper/contract 구조를 반영했습니다.
- Unified Catalog 요청 파라미터에 `debug`, `refresh`, `onlyNew`, `changedSince`, `includeTimestamps`, `enrichSources`를 추가했습니다.
- Unified Catalog 성공 응답을 `data.items|merged|pageInfo`, top-level `fetchedAt`, 조건부 `meta.debug`/`diagnostics` 구조로 정리했습니다.
- `UnifiedCatalogItem` 설명에서 `pageInfo`를 item 필드에서 제거하고 `sourceIds`, `summary`, `badges`를 보강했습니다.
- `POST /api/recommend`의 query `topN` override는 현재 코드 기준으로 확인되어 `[검증 필요]` 표식을 제거했습니다.
- 주요 API 명세 앞에 이 문서가 사용자 주 흐름의 핵심 API만 요약한다는 한계를 명시했습니다.

## 아직 남은 쟁점
- `analysis_docs/**`가 git 추적 대상이 아니어서 `git diff --check -- analysis_docs/03_DTO_API_명세서.md`는 출력 없이 종료됐고, 실제 whitespace 확인은 `--no-index` 보조 실행으로 확인했습니다.
- dev/ops/planning v3 보조 API 전체는 현재 route 수가 많아 이번 배치에서는 목록 전면 재정리 대신 문서 상의 명확한 낡은 설명만 갱신했습니다.

## 실행한 검증
- `git diff --check -- analysis_docs/03_DTO_API_명세서.md` (출력 없음, exit 0)
- `git diff --check --no-index /dev/null analysis_docs/03_DTO_API_명세서.md` (whitespace 오류 출력 없음, untracked diff라 exit 1)
- `git diff --no-index /dev/null analysis_docs/03_DTO_API_명세서.md`

## 다음 우선순위
- `analysis_docs/04_QA_명세서.md`의 테스트/회귀 시나리오가 현재 `tests/e2e/*.spec.ts`와 맞는지 확인
- 이후 `00`, `01`, `05` 문서에서 이번 교차 검토 결과를 요약 수준으로만 반영

## 남은 리스크
- 오늘 폴더에 유사한 `analysis_docs-03-dto-api.md` 기록이 이미 존재해 덮어쓰지 않고 새 슬러그로 분리했습니다.
- 패치 도구가 현재 저장소 내부 파일도 거부해 이번 배치 수정도 제한된 비대화식 스크립트로 처리했습니다.
