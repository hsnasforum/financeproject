# 2026-07-16 파이낸스 검증 4편 블로그 이미지 캡처

## 변경 파일

- `scripts/capture_finance_series_04.mjs`
- `docs/blog-assets/finance-series/04-public-release-boundaries/README.md`
- `docs/blog-assets/finance-series/04-public-release-boundaries/04-01-local-verification-timeline.png`
- `docs/blog-assets/finance-series/04-public-release-boundaries/04-02-deployment-mode-notes.png`
- `docs/blog-assets/finance-series/04-public-release-boundaries/04-03-storage-safety-boundary.png`
- `docs/blog-assets/finance-series/04-public-release-boundaries/04-04-encryption-policy-boundary.png`
- `docs/blog-assets/finance-series/04-public-release-boundaries/04-05-release-publishing-boundary.png`
- `docs/blog-assets/finance-series/04-public-release-boundaries/04-06-backup-restore-boundary.png`
- `work/7/16/2026-07-16-finance-series-04-blog-captures.md`

## 사용 skill

- `playwright`: 실제 Chromium 렌더링, 동일 규격 PNG 저장, 글자 잘림·캔버스 overflow·팝업·로딩 문구·민감정보 검사를 수행했습니다.
- `work-log-closeout`: 변경 파일, 실제 실행한 검증, 표현상 잔여 위험을 저장소 형식으로 기록했습니다.

## 변경 이유

- 공개 운영 보류 원고의 테스트 수, 배포 형태, 저장 topology, 암호화, 릴리스 게시, 백업·복원 경계를 프로젝트 내부 근거 이미지로 뒷받침해야 했습니다.
- 이전의 정교하고 대칭적인 인포그래픽보다 실제 자료를 사람이 읽고 표시한 작업 노트 느낌으로 문구와 배치를 바꿀 필요가 있었습니다.
- 원고의 백업·복원 설명이 일반 Planning 복원 경로와 v3 owner restore CLI를 한 범위로 묶지 않도록 이미지에서 구현 경계를 분리해야 했습니다.

## 핵심 변경

- 실제 코드와 `/work` 기록을 종이, 테이프, 형광펜, 짧은 메모 형태로 구성한 1200×700 PNG 6개를 생성했습니다.
- 7월 10일 테스트 2,590건과 회귀·E2E, 7월 12일 초기 패키징 중단과 수정 후 통과를 하나의 합성 로그가 아니라 시간순 작업 메모로 표시했습니다.
- 배포 형태 세 가지는 지원 완료 목록이 아니라 결정 전 후보라고 명시하고 현재 로컬 요청·loopback 경계를 함께 표시했습니다.
- 저장 모드 가드, process-local queue, 기본 비활성 암호화 설정과 평문 호환 경로를 각각 운영 완료 주장과 분리했습니다.
- 2026년 7월 16일 GitHub Release 목록에서 최신 공개 Release가 3월의 v1.0.4임을 읽기 전용으로 확인해 로컬 검증과 원격 게시를 구분했습니다.
- 일반 Planning 백업·복원 계약과 `V3_RESTORE_APPLY_DISABLED`가 적용되는 v3 owner restore CLI를 별도 구현으로 표시하고 원고 표현 주의를 README에 남겼습니다.

## 검증

- `command -v npx`: PASS (`/usr/bin/npx`)
- `node --check scripts/capture_finance_series_04.mjs`: PASS
- `node scripts/capture_finance_series_04.mjs`: PASS, 6개 PNG 생성
- 캡처 근거 assertion: 7월 10일 2,590 tests·회귀 9·E2E 10, 7월 12일 초기 release blocker·후속 release:verify PASS·symlink 0·desktop smoke PASS, 배포 후보 3종, process-local 경계, 암호화 기본 false와 평문 호환, v1.0.4 Release, backup manifest·SHA-256·AES-256-GCM·v3 apply 차단 확인
- GitHub Release 읽기 전용 조회: 최신 `v1.0.4`, 게시 시각 `2026-03-16T06:48:30Z`, 2026년 7월 게시 Release 없음
- Playwright 저장 PNG 원본 확인: 6개 모두 글자 잘림, 로딩 화면, 팝업, 브라우저 UI, 과도한 여백과 민감정보 노출 없음
- IMAGE_02 첫 렌더링에서 설명 메모와 출처 줄 간격이 좁아 padding과 글자 크기를 조정했고, 재생성 후 겹침이 사라진 것을 확인했습니다.
- `file docs/blog-assets/finance-series/04-public-release-boundaries/*.png`: 6개 모두 1200×700 8-bit RGB PNG
- Playwright CLI wrapper는 CRLF shebang 때문에 `/usr/bin/env: bash\r`로 시작되지 않았습니다. 직접 CLI 실행도 WSL에 Google Chrome 배포본이 없어 중단됐지만, 저장소에 설치된 Playwright Chromium을 사용하는 캡처 스크립트는 정상 완료했습니다.
- Computer Use는 사용하지 않았습니다.

## 남은 리스크

- IMAGE_05의 원격 Release 상태는 2026년 7월 16일 기준입니다. 새 Release가 게시되면 스크립트가 중단되며 최신 상태로 다시 만들어야 합니다.
- 원고의 “복원 전체가 막혀 있다”는 표현은 현재 코드보다 범위가 넓습니다. `v3 owner restore --apply`가 차단됐다고 좁혀야 IMAGE_06과 일치합니다.
- 실제 운영 사용자 데이터로 새 환경 복원을 수행한 증거와 native Windows 파일 잠금·reparse·open-handle 검증은 이번 이미지 작업 범위에 포함하지 않았습니다.
- 손글씨 폰트에 의존하지 않고 배치·형광펜·테이프 효과로 수작업 느낌을 냈기 때문에 환경별 한글 폰트 차이 없이 재현되지만, 티스토리 본문 축소 폭에서의 최종 가독성은 게시 전 확인이 필요합니다.
