# 2026-10-06 Finance 재무 진단 입력·결과 동선 정리

## 변경 파일

- 제품 6파일: `PlanningWorkspaceClient.tsx`, `PlanningQuickStartGate.tsx`, workspace panels의 `topSurfacePanel.tsx`, `profilePanel.tsx`, `executionPanel.tsx`, `resultsPanel.tsx`.
- 테스트 3파일: `tests/e2e/planning-quickstart-preview.spec.ts`, `tests/e2e/smoke.spec.ts`, `tests/planning/ui/planningQuickStartGate.test.tsx`.
- 현재 목표와 사용 안내: `FINANCE_ACTIVE_GOAL.md`, `README.md`, 이 기록. 정확한 경로/변경 SHA는 복구 폴더의 `delivery-files.json`에 보존.

## 사용 skill

- planning-gate-selector: 사용자 화면 변경의 관련 테스트·실제 동선·필요한 종료 build 선택.
- frontend-skill: 핵심 정보와 보조 옵션 분리, 대비·가독성·키보드·모바일 실제 화면 검토.
- work-log-closeout: 이번 전달 단위를 이 기록 하나로 종료.

## 핵심 변경

- `/planning` 제목을 재무 진단으로 정리하고 재무 정보 → 계산·기록 저장 → 진단 결과 이동을 명시. 기존 controller·계산·API·저장·인증은 보존.
- 초안 적용 후 입력폼을 접되 편집값 유지. 선택적 혜택 조건과 초보자 세부 계산/조건 비교를 접고, 실행 전 경고·확인은 기본 화면에 유지.
- 중복 진행 카드와 기본 메타데이터 노출을 줄임. 실제 저장 상태에 맞는 CTA와 이력/리포트 focus target 보존.
- 진단 결과에서 핵심 상태·확인할 점·주의 신호·기준일을 먼저 표시. 상세 해석·계산 근거·정규화 정보는 접은 영역에서 모두 접근 가능.
- 결과 탭의 한국어 이름과 기존 warning catalog 설명을 사용. 부채 상환 전 `생활지출 후 남는 돈`과 대시보드의 상환 후 잉여금 의미를 구분; 계산식은 변경하지 않음.
- 실제 화면 검토에서 선택된 프로필의 저장 버튼이 흰 배경/흰 글씨가 되는 class 충돌을 발견해 수정하고 computed style·실제 캡처로 확인.

## 검증

- 최종 변경 소스에서 타깃 Vitest 8 files / 40 tests PASS (`delivery-focused`, 3.17초).
- 제품·테스트 9파일 lint PASS (`delivery-lint`, 4.28초).
- 원래 quickstart 회귀 3개 PASS: 초안 미리보기/적용·첫 저장, profileId 진입의 다음 단계 focus, hash 확인 불가 시 이력 안내. 이후 영향받는 첫 흐름 및 planning page smoke를 재검증.
- 첫 흐름에는 키보드로 선택 영역을 열고 출생연도를 입력한 후 닫기·저장, 원본 소득/지출/기간 유지, 중복 클릭 1회 저장, 결과/근거 열기, 저장 리포트 열기·재조회와 추가 run 없음 검증을 포함.
- 마지막 저장 버튼 대비 수정 후 동일 첫 흐름 PASS (`browser-save-polish`, 30.11초). 다른 두 회귀의 상태 판단·target·호출 코드는 바뀌지 않아 이전 PASS 재사용.
- 1440×1000, 390×844 실제 브라우저 캡처를 열어 확인. 모바일 가로 넘침 없음, 접힌 영역 키보드 동작과 결과/리포트 링크 확인. 금액·프로필은 합성 fixture이며 실제 재무 데이터 검증이 아님.
- 일반 production build의 최종 결과/시간은 아래 적용 결과에 기록. build에는 E2E env를 섞지 않으며 같은 최종 소스의 TypeScript 검사까지 포함.
- 전체 test/verify/complete/RC, 실제 API 자격 증명·사용자 DB·desktop 설치·원격 CI/배포는 이번 마일스톤에서 실행하지 않음.

## 실패·재시도와 보존

- 최초 종료 build는 검증 helper가 E2E distDir/tsconfig 환경을 물려준 것을 로그에서 발견해 직접 중단(exit 143, 75.09초). 성공으로 집계하지 않음. 이후 E2E 변수를 제거한 별도 환경으로 일반 production build 수행. 앱 wrapper·검사·안전장치는 수정하지 않음.
- 저장소 밖 `/home/xpdlqj/finance-recovery/planning-20261006-211118/baseline`에 시작 소스/설정을 보존. 실제 .env·DB/runtime 자료는 복사·수정하지 않음. 격리 candidate와 합성 SQLite에서만 앱 실행/브라우저 검증 수행.
- 시작 HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`, staged 0. 기존 대시보드 개선과 다른 미커밋 변경은 보존. Git reset/clean/stash/stage/commit/push 및 배포 없음.

## 남은 리스크

- 이번 완료 범위는 재무 진단 입력·결과 동선의 로컬 소스 반영. Finance 전체 완성, 실제 설치본 업데이트, 원격 재현성 또는 사용자의 만족 확정은 아님.
- 수입·지출·가정과 기존 계산값은 수정하지 않았으며 기존 엔진 전체 정확성을 새로 보증하지 않음.
- Node 실제 22.23.2 / engines 22.22.2 경고는 기존 환경 차이. 의존성·모델·권한·전역 지침 변경 없음.

## 다음 라운드

저장된 리포트 전용 화면의 설명/이동 정리, 누적 Git 게시 묶음, 설치본 종합 검증은 후속 후보. 이번 완료 뒤 자동으로 확장하지 않음.

## 적용 결과

일반 production build PASS, 131.19초. 최종 제품/테스트 SHA는 검사 전후 같고 원본 반영본과 일치합니다. 이번 delta 12파일의 원본 반영과 scoped git diff --check PASS를 확인했습니다. 이번 범위 밖 기존 파일 변경 없음, HEAD/index 보존. 임시 검증 서버는 종료했으며 실제 설치본/배포는 변경하지 않았습니다.
