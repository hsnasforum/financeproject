# 2026-03-09 planning reports 안전 fallback 구현

### 현재 상태

- 공식 경로 기준에서 이번 영향 범위는 `/planning/reports`, `/planning/reports/[id]`로 한정했다.
- 현재 `reportInputContract`는 strict only라서 `outputs.engine` 또는 `outputs.resultDto`가 빠진 실행 기록은 계약 단계에서 바로 실패한다.
- UI의 `safeBuildReportVMFromRun`도 이 실패를 그대로 `vm: null`로 반환해서, 화면이 비거나 강한 오류 상태로만 끝나는 문제가 있었다.

### 수행 내용

- `safeBuildReportVMFromRun`에서 contract 빌드 실패 시 `buildReportVM(run, report)`로 최소 리포트 VM을 다시 구성하도록 변경했다.
- fallback 성공 시 `contract.fallbacks`에 `legacyEngineFallback`, `legacyResultDtoFallback`, `contractBuildFailureFallback` 중 하나를 기록하도록 정리했다.
- fallback 시 schema version이 없으면 `0`으로 표시해서 strict canonical contract와 구분되게 했다.
- 관련 테스트를 수정해서 엔진 envelope 누락, resultDto 누락 상황에서도 안전 fallback VM이 반환되는지 검증하도록 보강했다.

### 검증 계획

- 우선 `tests/planning-v2/reportViewModel.safeBuild.test.ts`
- 필요 시 `pnpm test`

### 남은 리스크

- API/export 라우트는 여전히 strict contract를 유지하므로 legacy run에 대한 서버 응답 정책은 이번 작업 범위에서 바뀌지 않는다.
- fallback 표시는 UI에서 raw key 문자열로 노출되므로, 이후 사용자 친화 문구가 필요할 수 있다.

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
