# 2026-03-24 planning v2 profile create editor reset regression fix

## 변경 파일
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/e2e/planning-v2-fast.spec.ts`
- `work/3/24/2026-03-24-planning-v2-profile-create-editor-reset-regression-fix.md`

## 사용 skill
- `planning-gate-selector`: planning v2 사용자 편집 흐름 회귀에 맞춰 `pnpm lint`, `pnpm build`, 좁은 Playwright 회귀를 선택했다.
- `work-log-closeout`: 실제 수정 범위, 실행한 검증, 남은 리스크를 오늘 `/work` 형식으로 남겼다.

## 변경 이유
- 프로필을 선택한 상태에서 이름이나 일부 값을 수정한 뒤 `새로 만들기`를 준비하면 편집 중 값이 저장된 프로필로 다시 hydrate되면서, 이름이 `기본 프로필`로 돌아가고 나머지 입력도 초기화되는 회귀가 있었다.
- 최신 `/work` 기준선 확인과 별개로, 사용자 작성 흐름이 실제로 깨지는 문제라 중간에 가장 작은 수정으로 바로 막을 필요가 있었다.

## 핵심 변경
- `PlanningWorkspaceClient`의 `applyHydratedProfileEditorState`를 `profileName` state 변화에 종속되지 않는 stable callback으로 바꿨다.
- 선택된 프로필 rehydrate effect가 이름 입력 중 다시 실행되지 않도록 막아, 편집 중 `profileName`과 form 값이 저장된 기본 프로필 상태로 덮어써지지 않게 했다.
- `tests/e2e/planning-v2-fast.spec.ts`에 선택된 프로필 편집값이 새 프로필 준비 중 유지되는 좁은 회귀 테스트를 추가했다.
- 이번 라운드에서는 profile route contract, 저장 API payload, 저장 후 흐름, beginner/advanced IA는 건드리지 않았다.

## 검증
- `pnpm lint` — PASS (`0 errors / 30 warnings`, 기존 unused-vars warning 유지)
- `pnpm build` — PASS
- `pnpm planning:v2:e2e:fast --grep "keeps unsaved profile edits while preparing a new profile"` — PASS

## 남은 리스크
- 이번 수정은 selected-profile hydrate reset 회귀를 막는 범위에만 한정된다. beginner mode 전환, quickstart apply, duplicate/update 등 다른 편집 경로의 장기 회귀까지 전부 다시 열어본 것은 아니다.
- 미실행 검증: `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
- 다음 라운드는 이 회귀를 다시 열기보다, 최신 backlog 기준선대로 `recommend / action follow-through surface`의 docs-first candidate audit로 복귀하는 편이 안전하다.
