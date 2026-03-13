# Planning v2 Release Checklist

## Release Ops (P97-138)
- [ ] `pnpm release:prepare -- --version=x.y.z` (버전 bump + changelog 스텁 갱신)
- [x] `pnpm release:verify` (시작 preflight: `pnpm cleanup:next-artifacts`; 필수: `pnpm test` + `pnpm planning:v2:complete` + `pnpm multi-agent:guard`; script가 있으면 `pnpm planning:v2:compat`, `pnpm planning:v2:regress`; advisory `pnpm planning:ssot:check`)
- [x] 루트 [`RELEASE_CHECKLIST.md`](../RELEASE_CHECKLIST.md) 단계와 CI 게이트 정합성 확인

## 자동 체크
- [x] `pnpm test`
- [x] `pnpm planning:v2:regress`
- [x] `pnpm planning:v2:smoke`
- [x] `pnpm planning:v2:guard`
- [x] `pnpm planning:v2:freeze:guard`
- [x] `pnpm planning:v2:scan:guards`
- [x] `pnpm planning:v2:seed`
- [x] `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:smoke:http`
- [x] `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance`
- [x] `pnpm planning:v2:release:notes`
- [x] `pnpm planning:v2:release:evidence`
- [x] `pnpm planning:v2:release`
- [x] `pnpm planning:v2:release:local` (서버 실행 후)
- [x] `pnpm planning:v2:final-report`
- [x] `pnpm planning:v2:record`

## 완성 확인 (3단계)
- [x] `pnpm planning:v2:complete`
- [x] 서버 실행 후 `pnpm planning:v2:acceptance`
- [ ] `docs/planning-v2-5min-selftest.md` 체크 항목 1회 완료
- [ ] `docs/planning-v2-policy-defaults.md` 기준으로 기본 정책값(Planning/Ops) 변경 없음 확인

## Release Verify Gate Snapshot
- [x] `pnpm test` PASS
- [x] `pnpm planning:v2:complete` PASS
- [x] `pnpm multi-agent:guard` PASS
- [x] `pnpm planning:v2:compat` PASS (script present 시 optional gate)

## Version / Tag
- [ ] `package.json` 버전 업데이트 (예: `1.0.2`)
- [x] 릴리즈 노트 생성: `docs/releases/planning-v2-{version}.md`
- [ ] Git 태그 생성/푸시: `git tag v{version}` + `git push origin v{version}`

## 수동 체크
- [ ] `/planning`에서 프로필 선택 후 `Run plan`(simulate + scenarios) 실행
- [ ] `/planning`에서 `Save run` 저장 후 `/planning/runs`에서 2개 run 비교
- [ ] health critical 발생 시 ack 체크 전 저장/고비용 액션 제한 동작 확인
- [x] `PLANNING_DEBUG_ENABLED=false` 기본값에서 `/debug/*` 비노출(404) 확인
- [x] `PLANNING_DEBUG_ENABLED=true` + localhost 요청에서만 `/debug/*` 접근 가능 확인 (`tests/debug-access.test.ts`, `tests/e2e/debug-access.spec.ts`)
- [ ] `/ops/assumptions`에서 snapshot 상태 확인 및 `Sync now` 동작 확인
- [ ] `/ops/planning`에서 cache 상태 확인 및 `Purge expired` 동작 확인
- [ ] backup export/import 후 `pnpm planning:v2:doctor -- --strict` 실행

## 금지사항 확인
- [ ] UI/문서에 단정 추천(가입 강요/정답 표현) 문구 없음
- [ ] API 응답에 키/토큰/내부 경로(`.data/...`) 누출 없음
- [ ] finlife 후보는 비교 정보(목적/기간/금리 범위) 중심으로만 표시

## Freeze 정책 확인
- [ ] v2 동결 이후 신규 기능 추가는 v3 트랙(문서/브랜치)에서만 진행
- [x] v2 코어 변경 시 `pnpm planning:v2:complete` + `pnpm planning:v2:regress` 실행 완료
- [ ] baseline 업데이트 시 승인(confirm) 기록 확인
- [ ] completion record(`.data/planning/release/V2_COMPLETION_RECORD.json`)는 동일 버전에서 덮어쓰지 않고, 새 버전에서만 갱신

## 실패 시 조치
- 자동 체크 실패 시 baseline/코드/환경을 구분해 원인 기록 후 재실행
- `planning:v2:guard` 실패 시 민감 문자열 제거 후 재검증
- `planning:v2:smoke:http` 실패 시 endpoint/status/error code를 우선 확인

## Rollback (backup + migration state)
1. `/ops/backup`에서 최신 백업 파일을 확보합니다.
2. 장애 시 직전 안정 버전으로 롤백 후 백업을 `replace` 모드로 복원합니다.
3. migration 상태를 확인합니다.
   - `.data/planning/migrations/migrationState.json`
   - `/ops/doctor` migration 카드
4. 필요 시 migration 보정:
   - `pnpm planning:v2:migrate:dry`
   - `pnpm planning:v2:migrate:apply`
5. 복구 확인:
   - `pnpm release:verify`

## Upgrade Notes (v2)
- legacy APR 입력값 `0 < x <= 1`은 percent로 정규화(`x * 100`)됩니다.
- canonical profile에서는 `debts[].aprPct`, `offers[].newAprPct`를 percent 단위로 사용합니다.
- `offers[].liabilityId`는 `debts[].id`와 정확히 일치해야 하며, 불일치 시 검증이 차단됩니다.

## Partial Validation Log (2026-03-08)
- 실행 완료:
  - `pnpm -C finance planning:v2:seed`
  - `PLANNING_BASE_URL=http://127.0.0.1:3100 pnpm -C finance planning:v2:smoke:http`
  - `PLANNING_BASE_URL=http://127.0.0.1:3100 pnpm -C finance planning:v2:acceptance`
  - `pnpm -C finance planning:v2:release:notes`
  - `PLANNING_BASE_URL=http://127.0.0.1:3100 pnpm -C finance planning:v2:release:evidence`
  - `pnpm -C finance planning:v2:release`
  - `pnpm -C finance planning:v2:release:local`
  - `pnpm -C finance planning:v2:final-report -- --base-url=http://127.0.0.1:3100`
  - `pnpm -C finance planning:v2:record -- --base-url=http://127.0.0.1:3100`
  - `curl -s -o /tmp/debug_default_1.html -w "%{http_code}" http://127.0.0.1:3100/debug`
  - `curl -s -o /tmp/debug_default_2.html -w "%{http_code}" http://127.0.0.1:3100/debug/planning`
  - `curl -s -o /tmp/debug_default_3.html -w "%{http_code}" http://127.0.0.1:3100/debug/rules`
  - `pnpm -C finance planning:v2:doctor -- --strict`
  - `pnpm -C finance planning:v2:doctor`
  - `pnpm -C finance test` (full suite)
  - `pnpm -C finance release:verify`
  - `pnpm -C finance test tests/planning-v2-api/simulate-route.test.ts tests/planning-v2-api/actions-route.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2-api/monte-carlo-route.test.ts tests/planning-v2-api/runs-report-route.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/planning-v2-api/runs-report-pdf-route.test.ts`
  - `pnpm -C finance test tests/planning-v2/reportInputContract.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx tests/planning/components/interpretationGuide.test.tsx`
  - `pnpm -C finance test tests/recommend-api.test.ts tests/schemas-recommend-profile.test.ts tests/saved-runs-store.test.ts tests/recommend-unified-vs-legacy.test.ts`
  - `pnpm -C finance planning:v2:guard`
  - `pnpm -C finance planning:v2:compat` (내부에서 `planning:v2:complete` 포함)
  - `pnpm -C finance planning:v2:regress`
  - `pnpm -C finance planning:v2:engine:guard`
  - `pnpm -C finance planner:deprecated:guard`
  - `pnpm -C finance typecheck:planning`
- 참고:
  - `planning:v2:smoke:http`, `planning:v2:acceptance`는 `127.0.0.1:3100` 기준으로 실행했고 PASS.
  - `planning:v2:release:notes` 산출물: `docs/releases/planning-v2-1.0.3.md`.
  - `planning:v2:final-report` 산출물: `docs/releases/planning-v2-final-report-1.0.3.md`.
  - `planning:v2:record` 산출물: `.data/planning/release/V2_COMPLETION_RECORD.json`.
  - debug 기본값 검증: `/debug`, `/debug/planning`, `/debug/rules` 모두 HTTP 404 확인.
  - `PLANNING_DEBUG_ENABLED=true` 검증: `pnpm test tests/debug-access.test.ts tests/dev-local-request.test.ts`와 `env PLANNING_DEBUG_ENABLED=true PORT=3113 pnpm e2e -- tests/e2e/debug-access.spec.ts`로 localhost 허용 / 외부 forwarded host 차단을 확인.
  - `planning:v2:doctor -- --strict`는 로컬 데이터 초기 상태(assumptions/profiles 디렉토리 부재)로 FAIL, non-strict는 PASS.
  - `pnpm -C finance test` 결과: `579 files / 1593 tests` PASS.
  - `pnpm -C finance release:verify` 결과: PASS (advisory `planning:ssot:check`는 WARN으로 기록되며 gate 실패는 아님).
  - 수동 항목 중 `5min selftest`, `policy-defaults 확인`, `version/tag`는 아직 미실행.
