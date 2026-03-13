# 2026-03-13 quickstart fallback browser verification

## 변경 파일
- tests/e2e/planning-quickstart-preview.spec.ts
- work/3/13/2026-03-13-quickstart-fallback-browser-verification.md

## 사용 skill
- planning-gate-selector: quickstart fallback 브라우저 검증 라운드에 필요한 최소 검증 세트를 유지했습니다.
- work-log-closeout: /work 종료 기록 형식과 실행 사실 정리를 맞췄습니다.

## 변경 이유
- 직전 quickstart recovery hardening 라운드의 미실행 항목이었던 browser fallback verification을 좁은 Playwright 범위에서 닫을 필요가 있었습니다.
- review fallback 상태에서 `실행 내역` 강조 동선이 실제 브라우저 시나리오에서도 자연스럽게 유지되는지 확인할 수 있는 회귀 케이스가 필요했습니다.

## 핵심 변경
- `tests/e2e/planning-quickstart-preview.spec.ts`에 quickstart 입력/저장/첫 실행 완료까지 재사용하는 helper를 정리해, 기존 저장 프로필이 이미 있어도 테스트가 새 프로필 생성 경로로 안정적으로 진행되도록 맞췄습니다.
- 같은 spec에 `SubtleCrypto.digest` 실패를 브라우저 init script에서 강제로 유도하는 review fallback 케이스를 추가했습니다.
- 새 e2e 케이스는 첫 실행 직후 `planning-quickstart-applied-state`와 `planning-workspace-quickstart-status`에서 fallback 문구, `실행 상태 확인 필요`, `진행 상태 다시 확인`, `planning-quickstart-run-cta` 비노출, `planning-quickstart-runs-link` 강조를 함께 확인하도록 고정했습니다.
- fallback 상태에서 gate의 `planning-quickstart-next-step` 버튼이 `planning-quickstart-runs-link`로 포커스를 옮기고, 실제 `/planning/runs?profileId=...` 이동까지 이어지는 브라우저 동선을 검증했습니다.
- production code는 이번 라운드에서 수정하지 않았습니다.

## 검증
- `pnpm exec vitest run tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/workspaceQuickStart.test.ts` 통과
- `pnpm exec eslint src/components/planning/PlanningQuickStartGate.tsx src/components/PlanningWorkspaceClient.tsx src/app/planning/_lib/workspaceQuickStart.ts tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/workspaceQuickStart.test.ts tests/e2e/planning-quickstart-preview.spec.ts` 통과
- `pnpm build` 통과
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1` 통과
- `git diff --check -- tests/e2e/planning-quickstart-preview.spec.ts work/3/13/2026-03-13-quickstart-fallback-browser-verification.md` 통과

## 남은 리스크
- 이번 browser verification은 `SubtleCrypto.digest` 실패를 강제로 유도한 hash verification failure 경로를 닫은 것이고, 완전히 다른 브라우저 구현 차이까지 포괄하지는 않습니다.
- production code를 바꾸지 않았으므로, 실제 제품 문구 보정은 이번 라운드에서 필요 없다고 판단한 상태입니다.
- 저장 프로필 데이터가 누적되는 환경에서도 새 프로필 생성으로 테스트를 격리했지만, 장기적으로는 e2e fixture 정리가 별도 과제로 남아 있습니다.

## 다음 라운드
- latest `/work` note 형식 보정을 반영한 뒤 `pnpm multi-agent:guard`부터 single-owner final gate를 다시 실행합니다.
- 첫 FAIL이 나오면 그 명령과 첫 오류 한 건만 다음 배치 우선순위로 고정합니다.
