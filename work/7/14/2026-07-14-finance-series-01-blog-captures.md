# 2026-07-14 파이낸스 검증 1편 블로그 이미지 캡처

## 변경 파일

- `scripts/capture_finance_series_01.mjs`
- `docs/blog-assets/finance-series/01-amortization-rounding/README.md`
- `docs/blog-assets/finance-series/01-amortization-rounding/01-01-planning-debt-estimate.png`
- `docs/blog-assets/finance-series/01-amortization-rounding/01-02-payment-rounding-path.png`
- `docs/blog-assets/finance-series/01-amortization-rounding/01-03-amortization-fixture.png`
- `docs/blog-assets/finance-series/01-amortization-rounding/01-04-amortization-test-contract.png`
- `docs/blog-assets/finance-series/01-amortization-rounding/01-06-rounding-timing-comparison.png`
- `work/7/14/2026-07-14-finance-series-01-blog-captures.md`

## 사용 skill

- `finance-skill-routing`: 이미지 생성·검증에 필요한 최소 저장소 skill 조합을 선택했다.
- `planning-gate-selector`: 캡처 스크립트 문법 검사, 실제 재생성, focused 계산 테스트와 문서 diff 검사를 선택했다.
- `playwright`: 실제 `/planning` 화면 재현, fixture 일치 assertion, 동일 규격 PNG 생성과 clipping 검사를 수행했다.
- `work-log-closeout`: 변경 파일, 실행한 검증과 남은 리스크를 이 문서에 정리했다.

## 변경 이유

- 파이낸스 검증 1편 원고의 월 납입액 계산, fixture, 테스트 계약과 반올림 시점 차이를 프로젝트 내부 근거 이미지로 뒷받침해야 했다.
- 화면과 fixture가 다르면 임의로 숫자를 맞추지 않고 캡처를 중단하는 반복 가능한 절차가 필요했다.
- 개인정보와 로컬 경로를 제외하고 블로그 편집에 바로 사용할 파일명, 캡션과 대체 텍스트를 함께 남길 필요가 있었다.

## 핵심 변경

- `/planning`에 1,200,000원·연 12%·12개월을 입력해 106,619원이 표시될 때만 실제 화면을 저장한다.
- 실제 fixture·공통 계산 함수·화면 추정 함수·테스트 코드를 확인해 IMAGE_01·02·03·04를 1200×700 PNG로 생성한다.
- 두 실제 상환표 함수를 같은 조건으로 실행해 마지막 납입액 106,619원과 106,614원의 5원 차이를 IMAGE_06에 표시한다.
- IMAGE_05는 E2E 38건과 `release:verify` 실행 순서를 증명할 근거가 부족해 생성하지 않는다.
- 자산 README에 삽입 위치, 캡션, 대체 텍스트, 보안 검수와 원고 수정 필요 사항을 기록한다.

## 검증

- `command -v npx`: PASS (`/usr/bin/npx`)
- `npx --yes --package @playwright/cli playwright-cli --session finance-series-01 open http://127.0.0.1:3180/planning --browser firefox`: PASS
- `npx --yes --package @playwright/cli playwright-cli --session finance-series-01 snapshot`: PASS
- `corepack pnpm test tests/planning/calc/financial-correctness.test.ts tests/planning/calc/amortization.ref.test.ts`: 2개 파일·8개 테스트 PASS
- `node --check scripts/capture_finance_series_01.mjs`: PASS
- `BLOG_CAPTURE_BASE_URL=http://127.0.0.1:3180 node scripts/capture_finance_series_01.mjs`: PASS
  - 화면 및 fixture: 1,200,000원·12%·12개월·추가상환 0원 → 106,619원
  - 두 구현의 마지막 납입액: 106,619원 / 106,614원, 차이 5원
  - 내부 focused 테스트: 2개 파일·8개 테스트 PASS
  - 모바일 QA: viewport 390px, 문서 폭 510px, 가로 넘침 120px
- `file docs/blog-assets/finance-series/01-amortization-rounding/*.png`: 5개 모두 1200×700 RGB PNG
- 저장 PNG 5개 원본 렌더링 확인: 글자 잘림, 로딩 중 화면, 팝업, 과도한 여백, 브라우저 UI와 민감정보 노출 없음
- `git diff --check -- scripts/capture_finance_series_01.mjs docs/blog-assets/finance-series/01-amortization-rounding/README.md`: PASS
- Computer Use는 사용자 지시에 따라 이번 라운드에서 사용하지 않았다.

## 남은 리스크

- 390px 모바일 `/planning`에 가로 120px 넘침이 남아 있다. 이번 데스크톱 블로그 이미지에는 영향이 없지만 모바일 화면은 별도 수정이 필요하다.
- IMAGE_05는 E2E 38건과 `release:verify` 기록의 실행 시각·순서를 확인하기 전까지 사용할 수 없다.
- 원고의 “관련 두 파일의 최신 출력 미확보” 문장은 이번 8개 테스트 재실행 결과에 맞게 수정해야 한다.
- 소수 이자 합산 결과는 79,423원이지만 월별 표시용 반올림 이자를 합하면 79,424원이므로, 원고의 총이자 설명에는 집계 기준을 명시해야 한다.
