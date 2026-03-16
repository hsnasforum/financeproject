# 2026-03-16 analysis_docs 02 화면정의서 점검

## 변경 파일
- `analysis_docs/02_화면정의서.md`

## 사용 skill
- `work-log-closeout`: `/work` 중간 기록 형식과 검증/남은 쟁점 정리를 현재 저장소 관례에 맞추기 위해 사용

## 변경 이유
- `analysis_docs/02_화면정의서.md`의 홈, 실행기록, 리포트, 추천 이력, DART, 데이터 소스, ops/debug 접근 정책 설명이 현재 코드와 일부 어긋나 있었습니다.
- 코드 수정 없이 문서를 현행 기준으로 맞추는 이번 라운드 목적에 따라 오래된 설명만 최소 수정했습니다.

## 이번 배치에서 다룬 문서
- `analysis_docs/02_화면정의서.md`

## 현행과 달라서 고친 내용
- 화면 분류 기준에 `Legacy / Redirect`, `Prototype / Preview`를 반영하고 `Ops`, `Dev / Debug` 접근 정책을 현재 런타임 규칙에 맞게 조정했습니다.
- 홈(`/`)을 얇은 랜딩이 아니라 최근 플랜, 오늘 할 일, 핵심 서비스로 이어주는 허브형 화면으로 고쳤습니다.
- `/planning/runs`, `/planning/runs/[id]`, `/planning/reports`, `/planning/reports/[id]` 설명을 현재 클라이언트 구조와 기능 범위에 맞게 줄여서 정리했습니다.
- `/recommend/history`를 단순 열람이 아니라 비교, 내보내기, 삭제가 가능한 저장 실행 관리 화면으로 반영했습니다.
- `/public/dart`, `/public/dart/company`, `/settings/data-sources`, `/ops`, `/debug/*` 문구를 현재 동작과 접근 조건에 맞게 갱신했습니다.
- 서버 렌더/route 사용 경로를 코드에서 바로 단정하기 어려운 부분은 `[검증 필요]`로 낮췄습니다.

## 아직 남은 쟁점
- `/planning/reports`의 초기 run scope 해석과 클라이언트 데이터 로드 경계는 문서에서 `[검증 필요]`로 유지했습니다.
- `/settings/data-sources`의 status/build/ping 경로는 화면 기준 설명만 남겼고, 세부 API 계약은 다음 문서(`03_DTO_API_명세서.md`)에서 다시 확인해야 합니다.
- `analysis_docs/**`가 현재 Git 기준 untracked라 일반 `git diff --check`만으로는 변경 포착이 제한됩니다. 이후 배치도 `--no-index` 보조 확인이 필요합니다.

## 검증
- `git diff --check -- analysis_docs/02_화면정의서.md`
- `git diff --no-index --check -- /dev/null analysis_docs/02_화면정의서.md`

## 다음 우선순위
- `analysis_docs/03_DTO_API_명세서.md`의 DTO/API 설명을 현재 route/type 기준으로 검토
- `analysis_docs/04_QA_명세서.md`에서 실제 e2e 범위와 과장된 QA 항목을 정리
