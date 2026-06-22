# 2026-06-22 ops metrics owner meta 보존

## 변경 파일
- `src/lib/ops/metricsLog.ts`
- `tests/planning/ops/metricsLog.test.ts`
- `tests/planning/ops/actions-run-route.test.ts`
- `work/6/22/2026-06-22-ops-operator-metrics-owner-meta-plan.md`
- `work/6/22/2026-06-22-ops-metrics-owner-meta.md`

## 사용 skill
- finance-skill-routing: Auth/User Scope 후속 라운드에서 planning/ops 소유권 경계에 필요한 기본 skill 조합을 확인했습니다.
- planning-gate-selector: ops metrics 저장 경로와 route action 검증에 맞춰 targeted test, lint, build 검증을 선정했습니다.
- work-log-closeout: 실제 변경 파일, 검증 결과, 남은 리스크를 `/work` 종료 기록으로 남겼습니다.

## Spark 조건부 모델 판단
- manager-first 루프는 `work/6/22/2026-06-22-ops-operator-metrics-owner-meta-plan.md`로 분해와 후보 경로를 기록했습니다.
- 이번 구현은 metrics writer와 두 테스트 파일의 작은 범위라 Spark 병렬 구현은 사용하지 않았습니다. 정적 탐색과 최종 검증은 메인 라운드에서 단일 소유로 처리했습니다.

## 변경 이유
- `/api/ops/actions/run`과 ops doctor 계열은 planning 사용자 소유 작업을 `MIGRATION_ACTION` metrics로 기록하지만, 기존 metrics meta allowlist는 `planningUserId`, `authSource`, `planningNamespaceEnabled`를 보존하지 않았습니다.
- action/audit log는 namespace scope meta를 자동 병합하는 반면 metrics log는 호출부 meta에만 의존해 operator 증적에서 현재 planning 사용자 경계가 빠질 수 있었습니다.

## 핵심 변경
- `appendOpsMetricEvent`가 `PLANNING_NAMESPACE_ENABLED=1`일 때 현재 planning scope meta를 자동 병합하도록 했습니다.
- 모든 ops metric meta allowlist에 `planningNamespaceEnabled`, `planningUserId`, `authSource`를 추가했습니다.
- caller가 spoofed owner meta를 넘겨도 현재 scope meta가 우선하도록 병합 순서를 고정했습니다.
- metrics 단위 테스트와 `/api/ops/actions/run` route 테스트에서 파일에 persisted된 owner meta를 직접 검증했습니다.

## 검증
- PASS: `corepack pnpm test tests/planning/ops/metricsLog.test.ts tests/planning/ops/actions-run-route.test.ts tests/planning/ops/support-export-route.test.ts tests/planning/ops/ops-action-result-status.test.ts tests/planning/ops/ops-doctor-action-result.test.ts`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- 미실행: `corepack pnpm e2e:rc`는 사용자 화면, navigation, selector 변화가 아니라 metrics persistence와 API route 증적 검증이라 이번 라운드에서는 실행하지 않았습니다.

## 남은 리스크
- metrics는 support bundle에서 여전히 shared ops summary/recent 형태로 sanitize됩니다. bundle API가 planningUserId를 별도 공개 필드로 노출하지는 않습니다.
- owner meta는 `PLANNING_NAMESPACE_ENABLED=1`일 때만 자동 병합됩니다. namespace-off 운영은 기존 shared ops metrics 경계를 유지합니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
