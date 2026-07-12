# 2026-07-12 Issue #243 primary Button 대비 개선

## 변경 파일

- `src/app/globals.css`
- `src/components/ui/Button.tsx`
- `src/components/DartSearchClient.tsx`
- `tests/button-accessibility-contract.test.tsx`
- `work/7/12/2026-07-12-issue-243-button-contrast.md`

## 사용 skill

- `finance-skill-routing`: 공통 UI primitive 변경에 필요한 최소 skill 조합을 선택했습니다.
- `planning-gate-selector`: component/contrast test, lint, typecheck, full test, build, RC E2E 범위를 선택했습니다.
- `dart-data-source-hardening`: DART dev-only primary override 변경이 env·upstream·fallback·사용자 안내 계약에 영향을 주지 않는지 확인했습니다.
- `playwright`: 랜딩·Planning·설정의 hover, disabled, keyboard focus computed style을 Firefox에서 확인했습니다.
- `work-log-closeout`: 실제 검증 결과와 계약 영향, 잔여 위험을 표준 `/work` 형식으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/243
- 기준 main: `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- 작업 브랜치: `codex/243-button-contrast`
- 공통 primary Button은 white label에 `hover:bg-primary/10`을 사용해 hover 합성색 대비가 약 1.19:1이었고, focus ring도 `ring-primary/10`이라 keyboard indicator가 약했습니다.
- dev-only DART 자동 생성 Button은 amber-600 override로 white text 대비가 약 3.19:1이어서 공통 primitive 수정만으로는 알려진 primary 예외가 남았습니다.

## 핵심 변경

- primary hover를 solid `#1d4ed8`로 바꿔 white label 대비를 6.702:1로 높였습니다. 기본 `#1e3a8a`는 10.358:1입니다.
- primary에만 `#2563eb` focus ring을 적용하고 2px white offset을 유지했습니다. white 대비 5.169:1, app background 대비 4.816:1입니다.
- Windows 고대비처럼 box-shadow가 제거되는 환경에서는 `CanvasText` 2px outline을 keyboard focus fallback으로 표시합니다.
- disabled primary는 opacity 합성 대신 `#cbd5e1` 배경과 `#334155` label을 사용해 6.974:1과 명확한 비활성 외형을 유지합니다.
- DART dev-only amber primary override를 amber-700/800로 좁혀 white 대비를 5.022:1/7.090:1로 맞췄습니다.
- 기존 Button props, variant, size, click/disabled 동작은 유지합니다. public API·응답 shape·stored data·DB schema/query·cache/revalidation·migration에는 영향이 없습니다.

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/button-accessibility-contract.test.tsx --reporter=dot`: PASS, 1 file / 5 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm typecheck`: PASS
- `corepack pnpm eslint src/components/ui/Button.tsx src/components/DartSearchClient.tsx tests/button-accessibility-contract.test.tsx`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages
- Playwright CLI Firefox 실브라우저:
  - 랜딩 `/` CTA default `rgb(30,58,138)`, hover `rgb(29,78,216)`, white text 확인
  - Planning `/planning` primary disabled `rgb(203,213,225)`/`rgb(51,65,85)`, opacity 1 확인
  - keyboard `Shift+Tab`으로 Planning primary에 focus 후 white 2px offset과 `rgb(37,99,235)` ring 확인
  - 설정 `/settings/backup` primary default/hover와 Tab focus에서 같은 token과 ring 확인
  - Firefox `forcedColors: active`에서 keyboard Tab으로 설정 primary에 focus 후 `matchMedia('(forced-colors: active)') = true`, box-shadow 제거 상태, `CanvasText` 기반 `rgb(0,0,0) solid 2px` outline 확인
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / 1 production-only skipped. DART flow, data-source settings, Planning quick start 포함. 이 검증 후 추가된 forced-colors 전용 CSS는 focused test, typecheck, targeted lint, Firefox 고대비 검증, 최종 full test와 build로 재검증했습니다.
- `corepack pnpm multi-agent:guard`: PASS, 최신 작업 기록 추적 확인
- `git diff --cached --check`: PASS
- 독립 정적 재검토: forced-colors focus P1 해소, 신규 P0/P1 없음
- DART 의존성 점검: env 이름, upstream request/response, missing index 안내, partial/fallback 동작은 변경하지 않았습니다.

## 남은 리스크

- `--primary-hover`는 공통 Button 외 랜딩·header·products Link CTA 6곳에도 적용됩니다. white 대비는 통과했고 랜딩 실브라우저와 RC E2E를 통과했지만 모든 viewport screenshot baseline을 새로 만들지는 않았습니다.
- 임의 `className`으로 primary foreground/background를 덮는 신규 사용처는 공통 token 계약을 우회할 수 있습니다. 현재 알려진 DART amber 예외는 contract test로 고정했습니다.
- Playwright CLI Chrome distribution은 WSL에 없어 Firefox로 수동 computed-style 검증했습니다. repository `e2e:rc`는 Chromium 기반으로 통과했습니다.
- rollback은 semantic token, Button state class, DART amber override와 contract test를 한 단위로 되돌립니다. 이전 대비 실패 색상으로만 복귀하지 않습니다.

## 다음 라운드 우선순위

1. Issue #244 모바일 주 navigation 중복·safe area·현재 위치 semantics를 최신 main에서 재확인합니다.
2. 공통 Button에 신규 color override를 추가할 때 contrast contract 대상인지 review합니다.
