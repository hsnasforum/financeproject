# 2026-07-14 파이낸스 검증 0편 블로그 이미지 캡처

## 변경 파일

- `scripts/capture_finance_series_00.mjs`
- `docs/blog-assets/finance-series/00-verification-baseline/README.md`
- `docs/blog-assets/finance-series/00-verification-baseline/00-01-planning-debt-estimate.png`
- `docs/blog-assets/finance-series/00-verification-baseline/00-02-route-catalog.png`
- `docs/blog-assets/finance-series/00-verification-baseline/00-03-release-verification-boundary.png`
- `docs/blog-assets/finance-series/00-verification-baseline/00-04-calculation-evidence.png`
- `docs/blog-assets/finance-series/00-verification-baseline/00-05-data-source-states.png`
- `docs/blog-assets/finance-series/00-verification-baseline/00-06-operations-boundary.png`
- `work/7/14/2026-07-14-finance-series-00-blog-captures.md`

## 사용 skill

- `finance-skill-routing`: 문서·캡처 검증에 필요한 최소 저장소 skill을 선택했다.
- `planning-gate-selector`: 캡처 스크립트에 `node --check`, 실제 재생성, focused 계산·route 검사를 적용했다.
- `playwright`: 격리 브라우저 컨텍스트에서 fixture 입력, 화면값 assertion, 동일 규격 PNG 저장과 clipping 검사를 수행했다.
- `computer-use`: Codex 데스크톱 접근성 상태에서 IMAGE_01 이미지 요소와 `106,619원` 텍스트 렌더링을 확인했다. Windows Graphics Capture 실패와 Chrome URL 신뢰 판정 중단은 시각 검수 한계로 분리해 기록했다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과와 남은 리스크를 이 문서에 정리했다.

## 변경 이유

- 파이낸스 프로젝트 검증 0편 원고의 계산, 경로 분류, 릴리스 경계, 데이터 provenance, 운영 topology 주장을 프로젝트 내부 근거 이미지로 뒷받침해야 했다.
- 실제 개인정보나 비밀값 없이 원고와 같은 fixture를 재현하고, 화면 결과가 다르면 캡처를 중단하는 반복 가능한 절차가 필요했다.
- 블로그 편집 시 이미지 삽입 위치, 캡션과 대체 텍스트를 다시 해석하지 않도록 자산 폴더에 사용 명세를 함께 남길 필요가 있었다.

## 핵심 변경

- `/planning`에 원금 1,200,000원, 연 12%, 12개월을 입력해 `추정 월상환액(참고): ₩106,619`가 표시될 때만 화면을 저장한다.
- 실제 fixture·코드·테스트·작업 기록에서 필요한 근거만 읽어 IMAGE_01~06을 1200×700 PNG로 생성한다.
- 2026-07-12 릴리스 기록은 현재 실행 결과와 섞지 않고 과거 기록임을 이미지 안에 명시했다.
- 모든 설명 이미지는 상대 경로만 노출하며 API 키, 토큰, 사용자명, 홈 경로와 실제 저장 데이터를 포함하지 않는다.
- 자산 README에 본문 삽입 위치, 캡션, 대체 텍스트, 캡처 범위와 민감정보 위험을 정리했다.

## 검증

- `command -v npx`: PASS (`/usr/bin/npx`)
- `BLOG_CAPTURE_BASE_URL=http://127.0.0.1:3180 node scripts/capture_finance_series_00.mjs`: PASS
  - 화면 fixture: 1,200,000원·12%·12개월 → 106,619원
  - 내부 실행 `corepack pnpm test tests/planning/calc/financial-correctness.test.ts`: 1개 파일·6개 테스트 PASS
  - 내부 실행 `corepack pnpm planning:current-screens:guard`: 5개 파일·9개 테스트 PASS
  - 현재 `src/app/**/page.tsx`: 95개
- PNG 규격 확인: 6개 모두 1200×700 RGB PNG
- 저장 PNG 원본 렌더링 확인: 글자 잘림, 로딩 중 화면, 팝업, 브라우저 UI와 민감정보 노출 없음
- Computer Use Windows 표시 검수: Codex 데스크톱 접근성 상태에서 IMAGE_01 이미지 요소, 대체 텍스트와 `106,619원` 텍스트 렌더링을 확인함. 다만 Windows Graphics Capture가 `0x80004002`로 실패해 스크린샷이 0건이었고 Chrome 경로도 URL 신뢰 판정 단계에서 중단됨. 시각 품질은 PASS로 기록하지 않고 Playwright assertion과 저장 PNG 원본 렌더링 검수로 대체함

## 남은 리스크

- 390×844 모바일 `/planning` QA에서 문서 폭 510px, viewport 390px로 가로 넘침 120px가 확인됐다. 이번 데스크톱 블로그 캡처에는 영향이 없지만 모바일 UI 후속 수정이 필요하다.
- IMAGE_03은 2026-07-12 과거 작업 기록의 요약이며 현재 `release:verify` 재실행 결과가 아니다.
- Computer Use의 Windows 시각 검수는 브라우저 URL 신뢰 판정과 Windows Graphics Capture 인터페이스 한계 때문에 완료 증거로 사용하지 않았다. 접근성 텍스트 확인만으로는 화면 구도·잘림 여부를 판정할 수 없다.
