# 2026-06-22 ops doctor partial response 정리

## 변경 파일
- `src/lib/planning/server/ops/doctorRouteService.ts`
- `src/app/api/ops/doctor/route.ts`
- `src/components/OpsDoctorClient.tsx`
- `tests/planning/ops/ops-doctor-action-result.test.ts`
- `tests/planning/ops/ops-doctor-route-action-response.test.ts`
- `work/6/22/2026-06-22-ops-doctor-partial-response-round-plan.md`
- `work/6/22/2026-06-22-ops-doctor-partial-response.md`

## 사용 skill
- finance-skill-routing: 최신 `/work` 잔여 리스크 기준으로 이번 구현 라운드의 기본 skill 조합을 확인했습니다.
- planning-gate-selector: ops API route, client UI 안내, 테스트 변경에 필요한 targeted vitest, lint, build 검증을 선정했습니다.
- dart-data-source-hardening: `partial` 상태가 완전 성공처럼 보이지 않도록 부분 성공/실패 구분 원칙을 적용했습니다.
- work-log-closeout: 실제 변경 파일, 검증 결과, 남은 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- 직전 라운드에서 `RUN_MIGRATIONS`의 `partial` 결과는 metric/action log/audit event에 `PARTIAL_SUCCESS`로 남지만, `/api/ops/doctor` POST 응답 본문에는 별도 상태가 없어 operator UI가 완전 성공처럼 해석할 수 있었습니다.
- `ok:true`는 API 실행 성공 의미로 유지하되, 본문과 화면 안내에서 부분 완료 상태를 분리해야 했습니다.

## 핵심 변경
- `OpsDoctorActionRunResult` 성공 응답에 `status`와 `message`를 추가하고 기존 `OpsActionRunStatus` 타입을 재사용했습니다.
- `/api/ops/doctor` POST 성공 응답이 `status`와 `message`를 포함하도록 했습니다.
- `/ops/doctor` client action 완료 안내가 `PARTIAL_SUCCESS`일 때 부분 완료 문구를 표시하도록 했습니다.
- doctor action service 테스트가 failed/partial 반환 상태를 함께 검증하도록 확장했습니다.
- doctor POST route 테스트를 추가해 `ok:true + status:"PARTIAL_SUCCESS"` 응답 계약을 고정했습니다.

## 검증
- PASS: `corepack pnpm test tests/planning/ops/ops-doctor-action-result.test.ts tests/planning/ops/ops-doctor-route-action-response.test.ts tests/planning/ops/ops-action-result-status.test.ts tests/planning/ops/actions-run-route.test.ts tests/planning/ops/ops-doctor-route-service-boundary.test.ts`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- TIMEOUT: `corepack pnpm build` 첫 실행은 244초 도구 제한으로 출력 없이 종료됐습니다.
- PASS: `corepack pnpm build` 재실행은 10분 제한에서 통과했습니다.
- 미실행: `corepack pnpm e2e:rc`는 route path, selector, 사용자 플로우 전환이 아니라 ops doctor action 응답/안내 계약 변경이라 이번 라운드에서는 실행하지 않았습니다.

## 남은 리스크
- `PARTIAL_SUCCESS`는 API 실행 실패가 아니므로 `ok:true`를 유지했습니다. 실패 처리로 바꾸면 기존 action caller 의미가 달라질 수 있습니다.
- `/ops/doctor` action 안내는 새 `status` 필드를 읽지만, 세부 남은 항목 확인은 기존 doctor 재실행 결과 카드와 metric/action log를 함께 봐야 합니다.
- `docs/current-screens.md`와 route SSOT는 새 경로나 링크를 만들지 않아 갱신하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
