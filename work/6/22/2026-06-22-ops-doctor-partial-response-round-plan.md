# 2026-06-22 ops doctor partial response round plan

## 변경 파일
- `work/6/22/2026-06-22-ops-doctor-partial-response-round-plan.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 메모 기준으로 이번 분석 라운드에 필요한 skill을 최소 조합으로 고정했습니다.
- `planning-gate-selector`: `/api/ops/doctor` POST 응답 계약 변경에 필요한 최소 검증 세트를 선정했습니다.
- `work-log-closeout`: 이번 계획 라운드의 사실, 남은 리스크, 다음 우선순위를 `/work` 형식으로 남겼습니다.

## 변경 이유
- 최신 `/work` 기준 잔여 리스크는 `RUN_MIGRATIONS`의 `partial` 결과가 `/api/ops/doctor` POST 응답 본문에서는 여전히 완전 성공처럼 보인다는 점입니다.
- 다음 구현 라운드에서 `PARTIAL_SUCCESS` 같은 상태 계약을 응답 본문에도 노출하되, route/service/test 범위만 건드리는 최소 수정이 필요합니다.

## 전달 변경
- 최신 메모 `work/6/22/2026-06-22-ops-partial-action-status.md`와 관련 코드 경로를 다시 확인했습니다.
- `src/lib/planning/server/ops/doctorRouteService.ts`는 `partial`일 때 metric에는 `PARTIAL_SUCCESS`를 기록하지만 반환 타입은 `ok/data`만 유지함을 확인했습니다.
- `src/app/api/ops/doctor/route.ts`는 service 결과를 그대로 `ok/data/meta`로 감싸므로 응답 본문에 operator status가 드러나지 않음을 확인했습니다.
- 다음 라운드 범위를 `doctorRouteService` 반환 타입, `/api/ops/doctor` POST JSON shape, `ops-doctor-action-result.test.ts` 및 route 테스트 추가 여부로 좁혔습니다.

## 검증
- 확인: `Get-ChildItem -Path work/6/22 -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 10 Name,FullName,LastWriteTime`
- 확인: `rg -n "RUN_MIGRATIONS|partial|doctor|ops" work/6/22 -g "*.md"`
- 확인: `rg -n "PARTIAL_SUCCESS|ok:false|ok: false|status" src/lib/planning/server/ops/doctorRouteService.ts src/app/api/ops/doctor/route.ts tests/planning/ops/ops-doctor-action-result.test.ts src/lib/ops/actions/types.ts src/lib/ops/actions/resultStatus.ts`
- 미실행: `corepack pnpm test`
- 미실행: `corepack pnpm lint`
- 미실행: `corepack pnpm build`

## 남은 리스크
- doctor POST 응답에 `status`를 추가할 때 기존 consumer가 strict shape를 기대하면 테스트 보강 없이 회귀가 날 수 있습니다.
- `partial`을 `ok:false`로 바꾸면 기존 의미와 달라지므로, 이번 범위는 `ok:true + status: PARTIAL_SUCCESS` 유지 여부를 먼저 명시해야 합니다.
- `/api/ops/actions/run`과 `/api/ops/doctor`의 상태 필드 명칭이 어긋나면 운영자 해석이 다시 분기될 수 있습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
