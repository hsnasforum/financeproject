# 2026-07-12 Issue #246 HomeHero 수동 캐러셀 접근성

## 변경 파일

- `src/components/home/HomeHero.tsx`
- `tests/home-hero-carousel-contract.test.tsx`
- `tests/e2e/home-hero-carousel.spec.ts`
- `package.json`
- `.github/workflows/e2e-smoke.yml`
- `work/7/12/2026-07-12-issue-246-home-hero-carousel.md`

## 사용 skill

- `finance-skill-routing`: 이번 UI 접근성 변경에 필요한 최소 skill 집합을 선택했습니다.
- `planning-gate-selector`: focused 단위/E2E, lint, typecheck, 전체 테스트, build, RC E2E 범위를 선택했습니다.
- `playwright`: 일반 모션과 reduced-motion 브라우저에서 hydration, 키보드·포인터 선택, 자동 전환 부재를 검증했습니다.
- `work-log-closeout`: 선택한 제품 동작, 검증 결과, 계약 영향과 잔여 위험을 종료 기록으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/246
- 기준 main: `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- 작업 브랜치: `codex/246-home-hero-carousel`
- 기존 `HomeHero`는 4.5초마다 슬라이드를 바꾸면서 pause control과 carousel/slide 의미를 제공하지 않았습니다.
- Issue가 허용한 가장 작은 안전한 경로로 autoplay를 제거했습니다. 따라서 pause/play, focus·hover·visibility pause 상태기계와 timer cleanup은 비적용입니다.

## 핵심 변경

- `setInterval`과 `useEffect`를 제거해 일반 환경과 reduced-motion 환경 모두 수동 선택만 유지합니다.
- 이름 있는 carousel `region`, 현재 slide `group`, 순번·제목 label, `aria-current`, `aria-controls`, polite live region을 추가했습니다.
- indicator는 44px hit target, 명시적 focus-visible outline, 흰 배경 대비 3:1 이상인 inactive `slate-500` 색을 사용합니다.
- 일반·reduced-motion E2E는 먼저 2번과 1번 슬라이드를 실제 입력으로 왕복해 hydration을 증명한 뒤 4.8초 동안 현재 slide가 유지되는지 확인합니다.
- 공용 E2E fixture는 `/`에서 HMR WebSocket을 대체해 hydration을 막는 기존 특성이 있어, 이 사양만 base Playwright fixture를 사용합니다. baseURL, webServer, headers, trace 설정은 기존 config를 그대로 사용합니다.
- 신규 E2E를 `e2e:rc`와 GitHub `e2e-smoke` 필수 목록에 포함했습니다.

## 계약 영향

- public API: 영향 없음
- 응답 shape: 영향 없음
- stored data: 영향 없음
- DB query: 영향 없음
- cache/revalidation: 영향 없음
- migration: 영향 없음
- route/href: 영향 없음
- UI/접근성: 자동 전환 제거, 수동 indicator와 현재 slide 의미·상태 노출, indicator 대비·focus 표시 강화

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test tests/home-hero-carousel-contract.test.tsx`: PASS, 1 file / 2 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:pw tests/e2e/home-hero-carousel.spec.ts --workers=1`: PASS, 2 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm typecheck`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 28 passed / production 전용 1 skipped
- `corepack pnpm multi-agent:guard`: PASS, 최신 work note tracked 확인
- `git diff --cached --check`: PASS
- 독립 reviewer: 차단 finding 없음. inactive indicator 대비, hydration 증명, 상시 E2E gate 포함 P2 3건을 모두 반영했습니다.
- 초기 focused E2E: 실제 랜딩이 기본 2개가 아닌 주입된 3개 slide를 사용해 기대값이 불일치했습니다. 실제 `landingHeroSlides` 계약으로 수정했습니다.
- 공용 E2E fixture 사용 시: `/` hydration이 되지 않아 클릭·키보드 입력이 반영되지 않는 현상을 React props와 입력 실패로 재현했습니다. base Playwright fixture에서 동일 입력이 통과했습니다.
- build 직후 전체 Vitest: desktop artifact provenance 2건이 `.next/standalone`의 Sharp symlink를 읽어 실패했습니다. 생성 `.next`를 정리한 뒤 같은 전체 테스트가 통과해 실행 순서 오염임을 확인했고, 최종 build와 RC E2E를 다시 실행했습니다.

## 남은 리스크

- autoplay 제거로 첫 slide 노출 비중이 커지고 뒤 slide의 마케팅 노출은 사용자의 수동 선택에 의존합니다.
- E2E는 현재 랜딩 slide id와 한국어 제목을 계약으로 사용하므로 콘텐츠를 바꾸면 의도적으로 함께 갱신해야 합니다.
- 공용 E2E helper의 root hydration 문제는 이번 Issue 범위 밖이며, 새 사양의 base fixture 사용 사유를 주석으로 고정했습니다.
- 전체 테스트는 build 산출물이 없는 상태에서 실행해야 desktop artifact provenance가 source fixture를 사용합니다. 최종 순서는 test → build → E2E로 유지했습니다.
- GitHub Actions의 실제 실행 가능 여부는 PR 생성 후 별도로 확인합니다.

## 롤백 기준

- 수동 indicator가 작동하지 않거나 carousel semantics가 보조기술에서 오히려 중복·오독되면 ARIA와 indicator 변경을 재검토합니다.
- pause control 없는 autoplay로는 되돌리지 않습니다. 제품이 autoplay를 반드시 요구하면 pause/play, focus·hover·visibility pause, reduced-motion, timer cleanup을 한 계약으로 새로 구현해야 합니다.
- RC/CI 시간 증가가 운영 한도를 넘으면 신규 E2E를 제거하지 않고 더 작은 상시 gate로 이동합니다.

## 다음 라운드 우선순위

1. Issue #247의 최신 main 근거와 기존 Issue/PR 중복을 다시 확인합니다.
2. 제품 결정이 필요한 #232와 운영 결정이 필요한 #242는 승인 전 구현하지 않습니다.
3. GitHub Actions pre-step 실패가 반복되면 저장소 테스트와 분리해 계정·runner·quota 상태를 운영 결정으로 보고합니다.
