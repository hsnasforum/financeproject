# 2026-03-16 analysis_docs 03 DTO API 후속 점검

## 변경 파일
- `analysis_docs/03_DTO_API_명세서.md`

## 사용 skill
- `work-log-closeout`: `/work` 중간 기록 형식과 실제 검증/남은 쟁점 정리를 저장소 관례에 맞추기 위해 사용

## 변경 이유
- `analysis_docs/03_DTO_API_명세서.md`의 공통 보안 설명이 현재 구현보다 넓게 단정되어 있었고, `ProfileCashflowV2` 상위 구조가 빠져 있었습니다.
- 이번 라운드는 전체 API surface 재작성 없이, 타입/guard 설명에서 현재 코드와 바로 어긋나는 부분만 최소 보강하는 것이 목적이었습니다.

## 이번 배치에서 다룬 문서
- `analysis_docs/03_DTO_API_명세서.md`

## 현행과 달라서 고친 내용
- 공통 계약 원칙에서 `planning v2 write API` 기준으로 범위를 좁히고, CSRF 분기 동작은 `[검증 필요]`를 붙여 과한 단정을 낮췄습니다.
- `ProfileCashflowV2` 상위 필드(`monthlyIncomeKrw`, `monthlyFixedExpensesKrw`, `monthlyVariableExpensesKrw`, `phases`, `pensions`, `contributions`, `rules.phaseOverlapPolicy`)를 현재 타입 정의에 맞게 추가했습니다.
- 기존 하위 타입(`CashflowPhaseV2`, `PensionFlowV2`, `ContributionFlowV2`) 설명은 유지하고, 빠져 있던 컨테이너 구조만 메웠습니다.

## 아직 남은 쟁점
- `POST /api/planning/v2/simulate`의 CSRF 분기처럼 route별 guard 예외가 있어, 공통 계약 서술은 계속 넓게 일반화하지 않는 편이 안전합니다.
- `analysis_docs/03_DTO_API_명세서.md`는 오늘 이미 같은 주제의 `/work` 기록이 존재하므로, 이번 기록은 후속 점검만 분리해 남깁니다.
- `analysis_docs/**`가 Git 기준 untracked라 일반 `git diff --check`만으로는 실제 파일 diff가 잡히지 않아, 이후 배치도 `--no-index` 보조 확인이 필요합니다.

## 검증
- `git diff --check -- analysis_docs/03_DTO_API_명세서.md`
- `git diff --no-index --check -- /dev/null analysis_docs/03_DTO_API_명세서.md`

## 다음 우선순위
- `analysis_docs/04_QA_명세서.md`에서 실제 `tests/e2e/*.spec.ts` 기준으로 과장된 QA 범위와 자동화 현황을 정리
- 이후 `00`, `01`, `05` 문서에서 이번 교차 검토 결과를 요약 수준으로만 반영
