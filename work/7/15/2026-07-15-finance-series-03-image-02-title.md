# 2026-07-15 파이낸스 검증 3편 IMAGE_02 제목 통일

## 변경 파일

- `scripts/capture_finance_series_03.mjs`
- `docs/blog-assets/finance-series/03-regression-boundaries/03-02-input-context-boundary.png`
- `work/7/15/2026-07-15-finance-series-03-image-02-title.md`

## 사용 skill

- `finance-skill-routing`: 이미지 문구 수정에 필요한 최소 저장소 skill 조합을 선택했다.
- `planning-gate-selector`: 캡처 스크립트 문법, 실제 재생성, PNG 규격과 문서 diff 검사를 검증 범위로 선택했다.
- `playwright`: 기존 캡처 스크립트로 동일 규격 PNG를 다시 생성하고 clipping·팝업·민감정보 검사를 수행했다.
- `work-log-closeout`: 변경 파일, 실행한 검증과 남은 위험을 이 문서에 정리했다.

## 변경 이유

- IMAGE_02 상단 제목의 `입력 준비 책임`과 왼쪽 카드의 `입력 준비 경계`가 서로 달라 표현을 `경계`로 통일해야 했다.
- 기존 캡처 스크립트의 원격 main 고정 커밋이 현재 필요한 helper 경로를 포함하지 않아 재생성이 중단됐으므로 실제 원격 main 근거로 갱신해야 했다.

## 핵심 변경

- 상단 제목을 `계산식을 바꾸지 않고 입력 준비 경계의 위치를 옮겼습니다`로 수정했다.
- `CURRENT_MAIN_COMMIT`을 실제 원격 main `5e15a1aedf5d970269cd6f263d5006f62bec937b`로 갱신했다.
- Playwright로 6개 PNG를 재생성했으며 기존 SHA-256과 비교해 IMAGE_02만 변경된 것을 확인했다.
- 수정된 PNG를 원본 해상도로 열어 상단 제목과 카드 제목의 표현 통일 및 글자 잘림 여부를 확인했다.

## 검증

- `command -v npx`: PASS (`/usr/bin/npx`)
- `node --check scripts/capture_finance_series_03.mjs`: PASS
- `git fetch --no-tags origin 00afcfeab907553981473d136b251e93ebe5b84a`: PASS, 과거 작업 기록 근거 객체 복구
- `git fetch --no-tags origin main`: PASS, 원격 main `5e15a1aedf5d970269cd6f263d5006f62bec937b` 확인
- `node scripts/capture_finance_series_03.mjs`: PASS, 6개 PNG 생성과 근거 assertion 통과
- `sha256sum docs/blog-assets/finance-series/03-regression-boundaries/*.png`: 기존 대비 IMAGE_02만 변경
- `file docs/blog-assets/finance-series/03-regression-boundaries/*.png`: 6개 모두 1200×700 8-bit RGB PNG
- 수정 PNG 원본 시각 확인: 제목 잘림, 로딩 중 화면, 팝업, 불필요한 여백과 민감정보 노출 없음

## 남은 리스크

- 캡처 스크립트는 원격 main의 특정 커밋을 근거로 고정한다. 원격 코드가 바뀌면 새 근거 커밋으로 다시 검증해야 한다.
- 이번 변경은 이미지 문구와 재현용 근거 커밋만 수정했으며 앱 코드나 계산 결과는 변경하지 않았다.
