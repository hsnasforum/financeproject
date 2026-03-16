# 2026-03-16 analysis_docs 화면정의서 현행 정비

## 변경 파일
- `analysis_docs/02_화면정의서.md`

## 이번 배치에서 다룬 문서
- `analysis_docs/02_화면정의서.md`

## 사용 skill
- `work-log-closeout`: 오늘 배치의 변경 파일, 실제 검증, 남은 쟁점을 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `docs/current-screens.md`와 현재 화면 코드 기준으로 볼 때, 화면 분류와 몇몇 핵심 화면 책임 설명이 현행보다 낡아져 있었습니다.
- 코드 수정 없이 `analysis_docs/**`만 최신 상태에 맞춰 최소 수정하는 것이 이번 라운드 목표였습니다.

## 현행과 달라서 고친 내용
- 화면 분류 기준에 `Prototype / Preview`를 추가하고 `/planning/reports/prototype` 인벤토리 누락을 반영했습니다.
- 홈(`/`) 설명을 정적 CTA 중심에서 최근 플랜 이어보기, 액션/혜택 연결, 준비 상태 요약 중심으로 수정했습니다.
- 실행기록 목록(`/planning/runs`) 설명을 `export JSON` 중심에서 비교, 액션 진행률, JSON 복사, soft delete/restore 중심으로 바로잡았습니다.
- 리포트 허브/상세(` /planning/reports`, `/planning/reports/[id]`) 설명을 현재 run scope 기반 로딩, 해석 가이드, 후보 비교, advanced raw/markdown 다운로드 기준으로 정리했습니다.
- 추천 이력, DART 메인/회사 상세, 데이터 소스 설정 설명을 현재 UI 책임에 맞게 갱신하고, 확인이 애매한 리포트 API 연결은 `[검증 필요]`로 남겼습니다.

## 검증
- `git diff --check -- analysis_docs/02_화면정의서.md`

## 아직 남은 쟁점
- 리포트 허브(`/planning/reports`)의 클라이언트 표시 단계 API 흐름은 관련 boundary/component까지 더 읽어야 문서 문구를 더 단정할 수 있습니다.
- `analysis_docs/03_DTO_API_명세서.md`, `analysis_docs/04_QA_명세서.md`는 아직 검토 전이라 현재 상태와 어긋난 항목이 추가로 나올 수 있습니다.

## 다음 우선순위
- `analysis_docs/03_DTO_API_명세서.md`를 현재 DTO/API 계약 기준으로 검토하고, 확인 불가 항목은 `[검증 필요]`로 낮춰 적기.
