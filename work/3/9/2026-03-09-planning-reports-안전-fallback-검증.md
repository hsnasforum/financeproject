# 2026-03-09 planning reports 안전 fallback 검증

## 현재 상태
- 워크트리에 광범위한 변경이 있어 이번 검증은 planning reports 안전 fallback 범위로 한정한다.
- 공식 경로 기준은 `docs/current-screens.md`를 따른다.
- 이번 검증 범위의 핵심은 사용자 화면 안전 유지와 report/export API strict 동작 유지다.

## 우선순위
1. `safeBuildReportVMFromRun` 적용 화면이 실패 시 안전하게 비워지거나 에러 상태로 유지되는지 확인
2. `/planning/reports`, `/planning/reports/[id]`, `/report` 경로 일관성 확인
3. report/html/pdf export API가 레거시 run을 조용히 허용하지 않는지 확인
4. planning 핵심 검증(`planning:v2:complete`, `planning:v2:compat`) 필요성과 실행 가능성 판단

## 수행 계획
- 관련 diff와 테스트 파일을 먼저 확인해 변경 유형을 분류한다.
- 관련 단위 테스트를 우선 실행한다.
- 페이지/경로 영향이 확인되면 `pnpm build`를 검토한다.
- planning 핵심 영향이 크면 `pnpm planning:v2:complete`, `pnpm planning:v2:compat` 실행 여부를 판단한다.

## 메모
- product 코드 수정은 현재 범위 밖이므로 검증 결과에 명확한 결함이 확인될 때만 별도 제안한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
