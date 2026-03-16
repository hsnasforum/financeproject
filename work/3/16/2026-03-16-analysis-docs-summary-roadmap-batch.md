# 2026-03-16 analysis_docs 00 01 05 정비 배치

## 변경 파일
- `analysis_docs/01_현행분석_및_개선기획서.md`
- `analysis_docs/05_개선로드맵_백로그.md`

## 이번 배치에서 다룬 문서
- `analysis_docs/00_실행요약.md` (검토 후 유지)
- `analysis_docs/01_현행분석_및_개선기획서.md`
- `analysis_docs/05_개선로드맵_백로그.md`

## 사용 skill
- `work-log-closeout`: 마지막 문서 배치의 변경 파일, 실제 검증, 남은 쟁점을 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `01_현행분석_및_개선기획서.md`의 테스트 자산 설명이 현재 `tests/e2e` 범위를 충분히 반영하지 못했습니다.
- `05_개선로드맵_백로그.md`의 신규 자동화 후보 중 `dart-landing-contract`는 현재 DART e2e 범위와 겹쳐 stale 후보가 됐습니다.
- `00_실행요약.md`는 이번 라운드 기준으로 현재 저장소와 직접 충돌하는 표현이 없어 유지했습니다.

## 현행과 달라서 고친 내용
- `01_현행분석_및_개선기획서.md`에서 자동화 테스트 자산 설명을 planning fast/full/quickstart, DART search/company/monitor/build, v3 draft apply까지 반영하도록 다듬었습니다.
- `05_개선로드맵_백로그.md`의 누락된 자동화 후보를 `dart-landing-contract`에서 현재 공백이 더 큰 `recommend-basic-flow`로 교체했습니다.
- `01`, `05`는 `--no-index` 보조 검증을 위해 줄 끝 공백도 함께 정리했습니다.

## 아직 남은 쟁점
- `analysis_docs/**`가 git 추적 대상이 아니어서 `git diff --check -- analysis_docs/...`는 출력 없이 종료됐고, 실제 whitespace 확인은 `--no-index` 보조 실행으로 확인했습니다.
- `05_개선로드맵_백로그.md`의 나머지 backlog 우선순위는 이번 라운드 범위 밖이라, 실제 제품 정책 변화 없이 문구가 직접 충돌하는 항목만 손봤습니다.

## 실행한 검증
- `git diff --check -- analysis_docs/00_실행요약.md analysis_docs/01_현행분석_및_개선기획서.md analysis_docs/05_개선로드맵_백로그.md` (출력 없음, exit 0)
- `git diff --check --no-index /dev/null analysis_docs/01_현행분석_및_개선기획서.md` (whitespace 오류 출력 없음, untracked diff라 exit 1)
- `git diff --check --no-index /dev/null analysis_docs/05_개선로드맵_백로그.md` (whitespace 오류 출력 없음, untracked diff라 exit 1)

## 다음 우선순위
- 이번 라운드 전체 `analysis_docs` 변경 파일만 모아 최종 점검
- 최종 보고에서 수정 문서, 검증, 남은 쟁점, 생성한 `/work` 기록을 일괄 정리

## 남은 리스크
- 패치 도구가 현재 저장소 내부 파일도 거부해 이번 배치 수정도 제한된 비대화식 스크립트로 처리했습니다.
- 오늘 폴더의 기존 dirty `/work` 문서들은 덮어쓰지 않고 새 파일만 추가했습니다.
