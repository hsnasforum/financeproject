# 2026-03-16 v1.0.4 릴리즈 노트 준비

## 변경 파일
- `package.json`
- `README.md`
- `docs/release-notes.md`
- `docs/planning-v2-changelog.md`
- `docs/releases/planning-v2-1.0.4.md`
- `work/3/16/2026-03-16-release-notes-v1.0.4.md`

## 사용 skill
- `work-log-closeout`: 오늘 릴리즈 노트 준비 라운드의 변경 파일, 실제 실행 검증, 남은 릴리즈 작업을 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 최근 완료된 public UI 정리, 계산 근거 오버레이 개선, 플래닝 입력 폭 수정, `analysis_docs` 정비 결과를 릴리즈 기준으로 묶어 기록할 필요가 있었습니다.
- 저장소 안 릴리즈 문서 형식은 이미 `docs/release-notes.md`와 `docs/releases/planning-v2-<version>.md`를 사용하고 있어, 같은 형식으로 이번 후속 릴리즈 준비 문서를 추가하는 것이 가장 작은 안전한 수정이었습니다.
- 버전과 릴리즈 스크립트의 `--version` 파라미터가 `1.0.3`에 머물러 있어, 이번 릴리즈 노트와 함께 `1.0.4`로 맞출 필요가 있었습니다.

## 핵심 변경
- 패키지 버전과 Planning v2 릴리즈 관련 스크립트의 `--version` 파라미터를 `1.0.4`로 맞췄습니다.
- `README.md` 상단 버전을 `v1.0.4`로 갱신했습니다.
- `docs/release-notes.md`에 `2026-03-16 (v1.0.4)` latest 항목을 추가했습니다.
- `docs/releases/planning-v2-1.0.4.md`를 새로 만들어 이번 릴리즈의 사용자 영향, 운영 메모, known limitations를 정리했습니다.
- `docs/planning-v2-changelog.md` 상단에 `Release Notes Prep (v1.0.4)` 항목을 추가했습니다.

## 버전 변경 범위
- `package.json` 버전: `1.0.3` -> `1.0.4`
- Planning v2 릴리즈 스크립트 6종의 `--version=1.0.3` -> `--version=1.0.4`
- `README.md` 상단 버전: `v1.0.3` -> `v1.0.4`

## 릴리즈 노트 핵심 요약
- 공식 public UI 밝은 톤 정리 마감
- 공식 사용자 화면 영문 라벨과 내부 값 노출 한글화
- `/planning/reports` 후보 비교표 계산 근거 중앙 오버레이 전환
- `/planning` 부채·목표 입력 폭 정렬 수정
- `analysis_docs` 정적 분석 문서 세트 정비 및 운영 메모 정리

## 검증
- `git diff --check -- package.json README.md docs/release-notes.md docs/planning-v2-changelog.md docs/releases/planning-v2-1.0.4.md work/3/16/2026-03-16-release-notes-v1.0.4.md`
- `git status --short`

## 남은 릴리즈 작업
- [추가 작업 필요] Git tag(`v1.0.4`) 생성 여부는 이번 라운드에서 처리하지 않았습니다.
- [추가 작업 필요] GitHub Release 생성 여부는 이번 라운드에서 처리하지 않았습니다.
- [미실행] `release:prepare`, `release:verify`, `pnpm build`, `pnpm lint`, `pnpm test`는 이번 라운드에서 실행하지 않았습니다.
