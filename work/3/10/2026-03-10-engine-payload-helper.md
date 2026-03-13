# 2026-03-10 engine payload helper 수렴

### 변경 파일

- `src/lib/planning/server/v2/toEngineInput.ts`
- `src/lib/planning/server/v2/runArtifacts.ts`
- `src/app/api/planning/v2/simulate/route.ts`
- `src/app/api/planning/v2/actions/route.ts`
- `src/app/api/planning/v2/scenarios/route.ts`
- `src/app/api/planning/v2/monte-carlo/route.ts`
- `src/app/api/planning/v2/optimize/route.ts`
- `src/app/api/planning/v2/debt-strategy/route.ts`
- `tests/planning/server/v2/toEngineInput.test.ts`

### 변경 이유

- `P0-2 engine orchestration` 우선순위에 맞춰 route별 `runPlanningEngineFromProfile() + attachEngineResponse()` 중복을 줄였다.
- 캐시 hit/live 응답과 run artifact 생성이 같은 `profile -> engine payload` helper를 사용하도록 맞췄다.
- v2 계약은 바꾸지 않고 engine envelope 조립 지점만 공통화했다.

### 핵심 변경

- `buildEnginePayloadFromProfile()` helper를 추가했다.
- simulate/actions/scenarios/monte-carlo/optimize/debt-strategy route가 공통 helper를 사용하도록 전환했다.
- `buildPlanningRunArtifacts()`도 같은 helper를 사용해 run output의 engine metadata 조립을 맞췄다.
- helper 단위 테스트를 추가해 입력 매핑과 engine envelope 부착을 고정했다.

### 검증

- `pnpm exec eslint src/lib/planning/server/v2/toEngineInput.ts src/lib/planning/server/v2/runArtifacts.ts src/app/api/planning/v2/simulate/route.ts src/app/api/planning/v2/actions/route.ts src/app/api/planning/v2/scenarios/route.ts src/app/api/planning/v2/monte-carlo/route.ts src/app/api/planning/v2/optimize/route.ts src/app/api/planning/v2/debt-strategy/route.ts tests/planning/server/v2/toEngineInput.test.ts`
- `pnpm test tests/planning/server/v2/toEngineInput.test.ts tests/planning-api-engine-contracts.test.ts tests/planning-v2-api/simulate-route.test.ts tests/planning-v2-api/actions-route.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2-api/monte-carlo-route.test.ts tests/planning-v2-api/optimize-route.test.ts tests/planning-v2-api/debt-strategy-route.test.ts`
- `pnpm test tests/planning-v2-api/run-route.test.ts tests/planning-v2-api/persistence-routes.test.ts`

### 남은 리스크

- 아직 `runPlanningEngine()` 자체가 core/v2 전체 orchestration entry는 아니다.
- assumptions context 해결과 route별 cache/meta 조립은 여전히 route 내부에 남아 있다.
- 전체 `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm planning:v2:compat`는 미실행이다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
