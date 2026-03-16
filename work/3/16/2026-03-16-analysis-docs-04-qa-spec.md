# 2026-03-16 analysis_docs 04 QA 명세 정비

## 변경 파일
- `analysis_docs/04_QA_명세서.md`

## 이번 배치에서 다룬 문서
- `analysis_docs/04_QA_명세서.md`

## 사용 skill
- `work-log-closeout`: 배치 단위 변경 파일, 실제 검증, 남은 쟁점을 `/work` 형식으로 남기는 데 사용.

## 변경 이유
- 현재 `tests/e2e/*.spec.ts` 기준으로 보면 DART, planning quickstart, planning v3 draft apply 자동화 범위가 문서보다 더 넓었습니다.
- 문서 안에는 예전 DART 준비중 가정과 오래된 유지 대상 e2e 목록이 남아 있어, 실제 테스트 자산 기준으로만 최소 수정이 필요했습니다.

## 현행과 달라서 고친 내용
- 자동화가 이미 검증하는 핵심 사실에 DART 검색/회사 상세/monitor/build 흐름과 runs detail action center 기준을 반영했습니다.
- DART QA 시나리오를 현재 구현 기준으로 `idle/missing-index`, 회사 상세 기본 정보/monitor 액션, monitor 날짜 범위 검증 중심으로 고쳤습니다.
- Planning v3 섹션에 `profile draft preflight / apply` 시나리오를 추가했습니다.
- 유지할 기존 e2e 목록에 `dart-build-index`, `dart-flow`, `dart-missing-index`, `planning-quickstart-preview`, `planning-v2-fast`, `v3-draft-apply`를 반영했습니다.
- QA 핵심 리스크의 DART 항목을 실제 문제 축인 `인덱스 없음 안내와 검색/모니터 기능 수준의 불일치`로 조정했습니다.

## 아직 남은 쟁점
- `analysis_docs/**`가 git 추적 대상이 아니어서 `git diff --check -- analysis_docs/04_QA_명세서.md`는 출력 없이 종료됐고, 실제 whitespace 확인은 `--no-index` 보조 실행으로 확인했습니다.
- `7.2 가장 먼저 추가할 자동화`는 제안 섹션이라 일부 항목의 우선순위는 후속 라운드에서 다시 줄일 수 있지만, 이번 배치에서는 현행과 직접 충돌하는 항목만 다뤘습니다.

## 실행한 검증
- `git diff --check -- analysis_docs/04_QA_명세서.md` (출력 없음, exit 0)
- `git diff --check --no-index /dev/null analysis_docs/04_QA_명세서.md` (whitespace 오류 출력 없음, untracked diff라 exit 1)

## 다음 우선순위
- `analysis_docs/00_실행요약.md`에서 앞선 02~04 정비 결과를 반영할 최소 요약 포인트 확인
- `analysis_docs/01_현행분석_및_개선기획서.md`, `analysis_docs/05_개선로드맵_백로그.md`에서 이미 반영된 현행과 충돌하는 오래된 표현만 정리

## 남은 리스크
- 패치 도구가 현재 저장소 내부 파일도 거부해 이번 배치 수정도 제한된 비대화식 스크립트로 처리했습니다.
- 오늘 폴더의 기존 dirty `/work` 문서들은 덮어쓰지 않고 새 파일만 추가했습니다.
