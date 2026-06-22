# 2026-06-22 Ops Actions Run Service Boundary

## 변경 파일
- `src/app/api/ops/actions/run/route.ts`
- `src/lib/ops/actions/actionRunRouteService.ts`
- `tests/planning/ops/ops-actions-run-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-zzzzz-ops-actions-run-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 흐름 기준으로 이번 구현 라운드에 붙일 skill 조합 확인
- `planning-gate-selector`: API route/service boundary 변경에 필요한 검증 세트 선정
- `work-log-closeout`: 종료 기록의 표준 섹션과 검증 기록 형식 확인

## 변경 이유
- `/api/ops/actions/run` route가 action definition, preview token, confirm validation, storage journal, audit, security audit, action log, metrics 기록을 직접 처리하고 있었습니다.
- 운영형 SaaS 기준에서는 route handler가 guard, auth, 입력 body 파싱, 응답 매핑만 담당하고 실행/기록 부수효과는 service 계층으로 묶는 편이 user scope와 저장소 전환 경계를 고정하기 좋습니다.

## 핵심 변경
- `actionRunRouteService`를 추가해 actionId 검증, params 정규화, preview token 소비, confirm 문구 검증, `runOpsAction` 실행을 route 밖으로 이동했습니다.
- storage journal, audit log, ops security audit, action log, metrics 기록과 redaction 처리를 service 안으로 모았습니다.
- `/api/ops/actions/run` route는 기존 dev/local/same-origin/CSRF guard, planning route user 확인, service 결과의 기존 응답 shape 매핑만 담당하게 줄였습니다.
- 정적 boundary 테스트를 추가해 route가 action registry, preview token, action log, audit/security/metrics log, planning journal, redaction helper를 직접 import하거나 호출하지 못하게 고정했습니다.
- manager agent로 PR 범위를 `ops/actions/run` 한 곳으로 제한했고, Spark explorer(`gpt-5.3-codex-spark`, `xhigh`)로 금지 패턴과 기존 테스트 후보를 정적 확인했습니다.

## 검증
- PASS `./node_modules/.bin/vitest run tests/planning/ops/actions-run-route.test.ts tests/planning/ops/ops-actions-run-route-service-boundary.test.ts tests/planning/ops/actions-types.test.ts tests/planning/ops/ops-action-result-status.test.ts`
- PASS `git diff --check`
- PASS `corepack pnpm sec:check`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm typecheck`
- PASS `corepack pnpm build`
- PASS `corepack pnpm test` (711 files, 2,279 tests)
- PASS `corepack pnpm planning:ssot:check`
- PASS `corepack pnpm verify` (regenerated report docs were restored because they were outside this PR scope)
- PASS `git diff --check --cached`
- FAIL `corepack pnpm multi-agent:guard`: latest `/work` note missing next round
- PASS `corepack pnpm multi-agent:guard` after adding `## 다음 라운드`

## 남은 리스크
- 이번 PR은 `POST /api/ops/actions/run`만 다룹니다. `src/app/api/ops/actions/preview/route.ts`는 아직 별도 service boundary 후보로 남아 있습니다.
- `ops/support/export.zip`, `ops/assumptions/refresh`, `ops/feedback/planning`, `ops/planning/doctor`에도 직접 접근 정리 후보가 남아 있습니다.

## 다음 라운드
- `src/app/api/ops/actions/preview/route.ts`의 action registry, preview token 발급, preview 실행 orchestration을 route service로 옮기고 boundary 테스트를 추가합니다.
