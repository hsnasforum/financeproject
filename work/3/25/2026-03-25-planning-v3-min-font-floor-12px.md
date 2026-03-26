# 2026-03-25 planning-v3 minimum font floor 12px

## 변경 파일
- `src/app/globals.css`
- `src/app/planning/v3/layout.tsx`

## 사용 skill
- `planning-gate-selector`: `planning/v3` 공통 layout + 전역 스타일 보정에 맞는 최소 검증 세트를 `대표 UI 테스트 + lint + build`로 좁히기 위해 사용.
- `work-log-closeout`: 실제 변경 내용, 실행 검증, 남은 리스크를 오늘 `/work` 형식으로 정확히 남기기 위해 사용.

## 변경 이유
- `planning/v3` 사용자 화면에서 `text-[10px]`, `text-[11px]`가 넓게 퍼져 있어 패널 구분을 개선하더라도 전체적인 읽기 밀도가 너무 촘촘하게 느껴졌다.
- 전역 폰트 규칙을 한 번에 바꾸기에는 범위가 너무 넓어, 우선 사용자에게 직접 보이는 `planning/v3` subtree에만 최소 12px floor를 안전하게 적용할 필요가 있었다.
- 90개가 넘는 파일의 utility를 개별 수정하는 대신, 공통 wrapper와 scoped override로 가장 작은 변경을 우선 적용했다.

## 핵심 변경
- `src/app/planning/v3/layout.tsx`를 새로 추가해 `planning/v3` 사용자 화면 전체를 `planning-v3-font-floor` wrapper로 감쌌다.
- `src/app/globals.css`에 `.planning-v3-font-floor .text-[10px]`, `.planning-v3-font-floor .text-[11px]`를 `12px(0.75rem)`로 올리는 scoped override를 추가했다.
- `text-xs`나 다른 전역 typography token은 건드리지 않고, `planning/v3` subtree 안의 10px/11px만 최소 12px로 맞췄다.
- route, href, API shape, selector, data contract는 변경하지 않았다.
- 개별 화면 파일을 대량 수정하지 않아 되돌리기와 후속 조정이 쉬운 형태로 남겼다.

## 검증
- `git diff --check -- src/app/globals.css src/app/planning/v3/layout.tsx` — 통과
- `pnpm test tests/planning-v3-balances.test.ts tests/planning-v3-batch-center-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx` — 통과
- `pnpm lint` — 통과 (`no-unused-vars` 기존 경고 25건 유지, 새 error 없음)
- `pnpm build` — 통과
- [미실행] `pnpm e2e:rc` — selector, href, flow hook를 바꾸지 않았고 이번 라운드는 typography floor만 조정해 제외했다.

## 남은 리스크
- `planning/v3` 내부의 일부 dense badge, overline, monospace textarea도 함께 12px로 올라가므로 줄바꿈이나 높이 체감이 약간 달라질 수 있다.
- 이번 변경은 `planning/v3` 범위에만 적용됐고, `products`, `recommend`, `settings`, `public stable` 등 다른 사용자 화면의 10px/11px는 그대로 남아 있다.
- 만약 이후 특정 raw/debug 성격의 `planning/v3` surface에서 11px 유지가 꼭 필요하다고 판단되면, 그 화면에만 예외 클래스를 두는 후속 조정이 필요하다.
