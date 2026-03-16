# 2026-03-16 analysis_docs 03 CSRF 재검증

## 이번 배치에서 다룬 문서
- `analysis_docs/03_DTO_API_명세서.md`

## 무엇을 확인했고 무엇을 고쳤는지
- `src/lib/dev/devGuards.ts`의 `hasCsrfCookie`, `assertCsrf`, `requireCsrf` 구현을 기준선으로 다시 읽었습니다.
- `src/app/api/planning/v2/**/route.ts`에서 `csrf` 사용 위치를 다시 찾고, `profiles`, `simulate/scenarios/share-report/debt-strategy/monte-carlo/actions/reports/trash/optimize`, `runs` 계열로 분기 패턴을 나눠 확인했습니다.
- 공통 계약 원칙의 CSRF 설명을 막연한 `[검증 필요]` 문장 대신, 현재 저장소에서 확인된 route 묶음별 동작으로 교체했습니다.
- `profiles` 계열은 cookie만 있어도 body token 누락 시 실패하고, `reports`를 포함한 다수 route는 cookie와 body token이 모두 있을 때만 `assertCsrf()`를 호출하며, `runs` 계열은 `requireCsrf(..., { allowWhenCookieMissing: true })`를 사용한다는 점을 반영했습니다.

## 아직 확정 못 한 항목
- 이 문서는 공통 계약 문서이므로 route별 모든 예외를 표로 확장하지는 않았습니다. 이후 route가 더 늘어나면 다시 넓게 일반화하지 말고 현재처럼 묶음 기준으로만 갱신하는 편이 안전합니다.
- CSRF 분기는 구현상 확인했지만, 운영 환경에서 어떤 cookie가 실제로 항상 존재하는지는 이번 라운드 범위 밖이라 문서에 추가하지 않았습니다.

## 실행한 검증
- `git diff --check -- analysis_docs/03_DTO_API_명세서.md`
- `git diff --no-index --check -- /dev/null analysis_docs/03_DTO_API_명세서.md`

## 다음 우선순위
- `analysis_docs/**`가 untracked인 현재 상태가 문서 검증 신뢰도에 주는 영향을 `/work` 운영 정리 메모로 남기기
- `work/3/16`의 유사 `analysis-docs-*` 메모를 자동 정리하지 않고, 다음 라운드용 추천안만 정리하기

## 사용 skill
- `work-log-closeout`: `/work` 중간 기록 형식과 검증/남은 쟁점 정리를 저장소 관례에 맞추는 용도
