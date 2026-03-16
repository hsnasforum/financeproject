# 2026-03-16 플래닝 리포트 계산 근거 중앙 오버레이·한글 라벨 정리

## 변경 파일
- `src/app/planning/reports/_components/CandidateComparisonSection.tsx`

## 사용 skill
- `planning-gate-selector`: `/planning/reports` 사용자 경로의 비교표 UI 변경이라 `git diff --check`와 `pnpm build`를 최소 검증으로 선택하는 데 사용.
- `work-log-closeout`: 오늘 라운드의 실제 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 플래닝 리포트의 상품 후보 비교표에서 `Calculation Evidence`가 영문으로 표시되고 있었습니다.
- 해당 셀은 `details`로 표 안에서 바로 펼쳐져 행 높이가 커지고, 현재 읽고 있던 비교표 흐름이 끊기는 문제가 있었습니다.
- 우측 패널 시도 후에도, 사용자는 보고 있던 리포트 위에 뜨는 가운데 박스형 오버레이가 더 익숙하고 자연스럽다고 판단했습니다.
- 같은 비교표 안에 `Candidate Compare`, `Fetched`, `Comparison Setup`, `Calculation Assumptions`처럼 설명성 영문 라벨도 남아 있어 함께 한글화할 필요가 있었습니다.

## 핵심 변경
- 후보 비교표의 `Calculation Evidence` 토글을 `계산 근거 보기` 한글 버튼으로 바꿨습니다.
- 표 셀 내부 확장 `details` 구조를 제거하고, 클릭 시 현재 페이지 위 가운데에서 열리는 계산 근거 오버레이로 전환했습니다.
- 중앙 오버레이에는 기관, 상품명, 조건 요약과 함께 `공식`, `입력값`, `가정`을 밝은 톤 단독 보기로 정리했습니다.
- 비교표 상단과 페이지네이션, 계산 가정 블록의 영문 라벨을 `후보 비교`, `기준 시각`, `비교 설정`, `계산 가정`, `기준 금액`, `세율`, `기간` 등 쉬운 한글로 정리했습니다.
- 출처 값도 사람이 읽기 쉬운 한글 라벨로 보이도록 `finlife -> 금융상품 한눈에` 같은 매핑을 추가했습니다.
- 오버레이는 비교표 데이터만 사용하고, `/planning/reports` 경로나 API 계약은 추가하지 않았습니다.
- 오버레이가 열린 동안 배경 스크롤을 잠그고, 배경 클릭이나 `Esc`로 닫을 수 있게 했습니다.

## 검증
- `git diff --check -- src/app/planning/reports/_components/CandidateComparisonSection.tsx`
- `pnpm build`

## 남은 리스크
- 모바일처럼 화면 폭이 좁은 환경에서는 중앙 오버레이가 사실상 전체 화면에 가깝게 보일 수 있어, 체감은 데스크톱과 다를 수 있습니다.
- 이번 수정은 후보 비교표의 계산 근거 셀에만 적용되어, 다른 표 내부 확장 UI가 있다면 별도 판단이 필요합니다.
