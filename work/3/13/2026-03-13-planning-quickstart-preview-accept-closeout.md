# 2026-03-13 planning quickstart preview accept closeout

## 변경 파일
- `src/app/planning/_lib/planningQuickStart.ts`
- `src/components/planning/PlanningQuickStartGate.tsx`
- `tests/planning/ui/planningQuickStart.test.ts`
- `tests/e2e/planning-quickstart-preview.spec.ts`
- `package.json`
- `README.md`
- `docs/README.md`

## 사용 skill
- `planning-gate-selector`: quickstart helper, UI, RC e2e 묶음 변경에서 `targeted vitest + eslint + build + e2e` 중 필요한 최소 검증만 고르기 위해 사용
- `work-log-closeout`: 이번 라운드의 실제 변경과 실제 검증 결과를 `/work` 형식에 맞춰 남기기 위해 사용

## 변경 이유
- `/planning` beginner front-door는 간단 시작 입력을 바로 적용해 버려 사용자가 적용 전 월 잉여금과 목표 적립 기준을 확인할 수 없었습니다.
- 이번 라운드는 엔진 교체나 저장모델 개편이 아니라 화면/흐름 검증이 우선이라, quickstart를 preview -> accept 2단계로 나누고 이 흐름을 RC 기본 게이트에서 다시 잡는 것이 가장 작은 실제 blocker였습니다.

## 핵심 변경
- `planningQuickStart`에 preview 전용 요약 모델을 추가해 월 실수령, 월 고정지출, 첫 초안 월 잉여금, 목표 월 적립 기준, 주의 문구를 적용 전에 계산하도록 정리했습니다.
- `PlanningQuickStartGate`를 `초안 미리보기 -> 이 초안으로 시작` 2단계로 바꾸고, 수정 중에는 preview를 다시 닫아 stale draft를 바로 적용하지 않게 했습니다.
- preview 문구는 canonical emergency label이 아니라 사용자가 입력한 목표 이름을 우선 보여 주도록 맞춰 beginner 화면 설명과 어긋나지 않게 했습니다.
- `/planning` quickstart browser flow를 `tests/e2e/planning-quickstart-preview.spec.ts`로 추가했고, `pnpm e2e:rc`, `pnpm e2e:rc:dev-hmr` 기본 묶음에도 포함해 이후 회귀를 기본 RC에서 잡도록 맞췄습니다.
- 운영 문서 `README.md`, `docs/README.md`에도 RC 핵심 셋이 `/planning` quickstart preview/accept까지 포함한다는 점을 반영했습니다.

## 검증
- `pnpm exec vitest run tests/planning/ui/planningQuickStart.test.ts tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/workspaceQuickStart.test.ts`
- `pnpm exec eslint src/app/planning/_lib/planningQuickStart.ts src/components/planning/PlanningQuickStartGate.tsx tests/planning/ui/planningQuickStart.test.ts tests/planning/ui/planningQuickStartGate.test.tsx tests/e2e/planning-quickstart-preview.spec.ts`
- `pnpm build`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
- `pnpm e2e:rc`
- `git diff --check -- src/app/planning/_lib/planningQuickStart.ts src/components/planning/PlanningQuickStartGate.tsx tests/planning/ui/planningQuickStart.test.ts tests/e2e/planning-quickstart-preview.spec.ts package.json README.md docs/README.md work/3/13/2026-03-13-planning-quickstart-preview-accept-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- preview는 beginner front-door 설명용 계산이라 실제 run 결과를 대신하지 않습니다. 적용 뒤 첫 실행 전까지는 quick rules나 status 문구가 별도로 붙지 않습니다.
- preview에는 사용자가 입력한 목표 이름을 보여 주지만, 내부 canonical profile normalization은 emergency 계열 goal 이름을 계속 정규화할 수 있습니다. 이번 라운드는 화면/흐름 범위라 엔진 normalization 계약은 바꾸지 않았습니다.
- `item/scenario` 등 다른 최근 배치와 달리 이번 quickstart 배치는 `/planning` 내부 흐름만 다뤘기 때문에 route SSOT 문서는 갱신하지 않았습니다.

## 다음 작업
- 홈 액션 요약에 quick rules 기반 상태 문구를 붙여 `홈 -> /planning` 앞단 문맥을 더 이어 붙일지 판단합니다.
- `/planning` 간단 시작의 preview 다음 단계에서 `accept`와 이후 첫 실행 안내를 더 분리할 실익이 있는지 검토합니다.
- 필요하면 quickstart preview/accept 다음의 `첫 실행 시작`까지 한 번에 묶는 더 좁은 e2e를 별도 배치로 추가합니다.
