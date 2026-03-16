# 2026-03-16 analysis_docs 04 QA 후속 점검

## 변경 파일
- `analysis_docs/04_QA_명세서.md`

## 사용 skill
- `work-log-closeout`: `/work` 중간 기록 형식과 실제 검증/남은 쟁점 정리를 저장소 관례에 맞추기 위해 사용

## 변경 이유
- `analysis_docs/04_QA_명세서.md`는 실제 `tests/e2e/*.spec.ts`보다 자동화 범위를 넓게 읽히는 항목이 일부 남아 있었습니다.
- 테스트 케이스 자체를 삭제하지 않고, 현재 자동화 근거가 없는 항목을 `[검증 필요]`와 수동 점검 성격으로 낮추는 것이 가장 작은 안전한 수정이었습니다.

## 이번 배치에서 다룬 문서
- `analysis_docs/04_QA_명세서.md`

## 현행과 달라서 고친 내용
- `Production-like non-local host` 환경 설명을 `/debug/*` 자동화 기준으로 좁히고 `/dev/*`, `/ops/*`는 `[검증 필요]` 수동 점검으로 낮췄습니다.
- `TC-PLN-010`, `TC-DAT-003`, `TC-V3-001~003`, `TC-SEC-001`, `TC-SEC-002`, `TC-SEC-005`에 `[검증 필요]`와 `자동화: 현재 없음`을 추가했습니다.
- `6.7 백업/복구/운영` 섹션을 현재 e2e direct coverage가 없는 운영 수동 점검 후보로 명시했습니다.
- `Stable Release Gate`의 `debug/dev production block` 문구를 `debug non-local block`으로 좁혔습니다.
- 부록 근거 파일에 누락돼 있던 DART 3종, `planning-quickstart-preview`, `planning-v2-fast` spec를 추가했습니다.

## 아직 남은 쟁점
- `confirmText mismatch`나 일부 planning 시나리오는 정책상 중요한 항목이지만, 현재 자동화 범위와 수동 점검 범위를 어디까지 분리할지는 다음 문서(`00`, `01`, `05`) 요약 반영 때 다시 맞출 필요가 있습니다.
- `analysis_docs/**`가 Git 기준 untracked라 일반 `git diff --check`만으로는 실제 파일 diff가 잡히지 않아, 이후 배치도 `--no-index` 보조 확인이 필요합니다.

## 검증
- `git diff --check -- analysis_docs/04_QA_명세서.md`
- `git diff --no-index --check -- /dev/null analysis_docs/04_QA_명세서.md`

## 다음 우선순위
- `analysis_docs/00_실행요약.md`, `analysis_docs/01_현행분석_및_개선기획서.md`, `analysis_docs/05_개선로드맵_백로그.md`에서 이번 교차 검토 결과를 요약 수준으로만 반영
- 이미 오늘 생성된 유사 `/work` 메모와 중복되는 항목은 최종 라운드에서 정리 여부만 판단
