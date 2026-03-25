# Maintenance Guide

## 주간 루틴
1. 데이터 상태 점검
   - `pnpm data:doctor`
2. 일일 산출물 갱신
   - `pnpm daily:refresh`
3. 품질 게이트 확인
   - `pnpm verify`
   - 멀티 에이전트 설정/프롬프트/skill을 건드린 주간이면 `pnpm multi-agent:guard`
   - 새 `/work` closeout을 바로 쓴 라운드라면 `latestWorkNoteTracking`이 `tracked`인지 `untracked`인지도 같이 확인합니다.

## 월간 루틴
1. DB 상태 점검
   - Prisma 스키마/마이그레이션 필요 여부 확인
   - `pnpm prisma:generate` / `pnpm exec prisma db push` 검토
2. Seed 정책 점검
   - `scripts/seed_debug.mjs` 데이터 유효성 확인
   - 테스트/개발 시드 불일치 여부 확인
3. 스냅샷/산출물 정책 점검
   - `docs/schema-drift-report.md`, `docs/data-freshness-report.md` 확인
   - `tmp/**`, `docs/dart-*.md` 보관/정리 정책 재확인

## 권장 운영 원칙
- 배포 전 stable release candidate 최소 single-owner gate: `pnpm release:verify && pnpm build`
- 사용자 경로/셀렉터 영향이 있으면 같은 소유자가 이어서 `pnpm e2e:rc`까지 순차 실행한다.
- 장시간 build나 최종 게이트 전 housekeeping이 필요하면 먼저 `pnpm cleanup:next-artifacts -- --build-preflight`를 실행한다. `pnpm release:verify`와 `pnpm build`도 같은 preflight cleanup 경로를 사용한다.
- `cleanup:next-artifacts`는 최신 성공 isolated build(`.next-build-info.json` 기준)는 보존하고, 오래된 `.next-build-*`, 대응 `-tsconfig.json`, stale build metadata를 정리한다.
- `cleanup:next-artifacts -- --build-preflight`는 위 정리에 더해 tracked isolated build 내부 `standalone/.data` shadow까지 지운다.
- dev 서버가 살아 있어도 오래된 `.next-build*` 정리는 계속 수행하지만, 공유 runtime 산출물(`.next-host*`, `.next-e2e*`) 정리는 active runtime이 비면 다시 실행하는 편이 안전하다.
- build/release preflight용 `standalone/.data` 정리는 active build/prod/playwright runtime이 없을 때만 수행한다.
- `release:verify`는 먼저 `pnpm cleanup:next-artifacts -- --build-preflight`를 실행한 뒤 `pnpm test`, `pnpm planning:v2:complete`, `pnpm multi-agent:guard`를 필수로 실행하고, 추가 게이트가 있으면 이어서 확인한다.
- `release:verify`의 planning e2e 하위 게이트는 전용 포트·고유 dist dir를 사용하고, `planning:v2:regress`는 임시 planning e2e data dir까지 분리해 shared runtime/data false negative를 줄인다.
- 사용자 경로/셀렉터 영향이 있으면 `pnpm e2e:rc`를 추가하고, 범위가 넓으면 `pnpm e2e`까지 넓힌다.
- `pnpm planning:v2:guard`, `pnpm planning:v2:engine:guard`는 planning v2 architecture/security/engine contract를 직접 건드린 release에서만 conditional gate로 붙이고, 결과는 release closeout 또는 change batch `/work`에 남긴다.
- `pnpm planning:v2:freeze:guard`는 v2 core 변경 visibility용 informational evidence이며 advisory 기록으로만 남긴다.
- `pnpm e2e:rc:dart`, `pnpm e2e:rc:data-sources`는 stable helper 범위를 좁혀 보는 subset gate이며, full stable RC closeout의 `pnpm e2e:rc`를 대체하지 않는다.
- shared `.next` 또는 dev server를 쓰는 최종 게이트(`pnpm build`, `pnpm e2e:rc`, `pnpm release:verify`)는 단일 소유로 순차 실행한다. concurrent repo build가 감지되면 `next_build_safe`는 `.next-build-<pid>` 같은 고유 dist dir로 우회한다.
- beta targeted Playwright와 `pnpm v3:doctor`/`pnpm v3:support-bundle`/`pnpm v3:restore`/`pnpm v3:migrate` 같은 ops/dev 명령은 stable release final gate에 자동 포함하지 않는다.
- `pnpm planning:v2:ops:run*`, `pnpm planning:v2:ops:safety*`, `pnpm planning:v2:ops:scheduler:health`, `pnpm planning:v2:ops:prune`는 release blocker가 아니라 ops cadence 또는 evidence 명령이다.
- scheduled cadence 결과는 `docs/planning-v2-scheduler.md` 기준으로 `scheduler.ndjson`과 ops log에 남기고, 수동 change batch에서 실행했다면 `/work`에 요약만 남긴다.
- stable release closeout은 tracked `/work` note를 source of truth로 삼고, primary/companion final gate, conditional minor guard, advisory record, 미실행 gate, evidence 위치, residual risk를 순서대로 남긴다.
- advisory-only 명령은 release blocker 결과와 섞지 말고 advisory record로 분리한다.
- scheduler/ops raw evidence는 `.data/planning/ops/logs/`, `.data/planning/ops/reports/`에 두고 release closeout과 `/work`에는 경로와 요약만 남긴다.
- current template adoption 기준의 first compliant exemplar는 `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`다.
- release closeout success 역할 reference는 `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`, blocker/smoke 역할 reference는 `work/3/13/2026-03-13-runtime-release-verify-smoke.md`를 유지한다.
- role split은 따로 본다.
  - template adoption 기준선은 current template를 가장 정확히 따르는 note를 유지한다.
  - success/blocker historical reference는 운영자 입장에서 success handoff 또는 first-blocker triage를 가장 빨리 읽히는 note를 유지한다.
- tracked exemplar는 더 좋은 note가 생겼다고 바로 교체하지 않고, current template 준수, gate/advisory/evidence 분리, 미실행 gate 표기, residual risk/next owner까지 더 명확히 담은 경우에만 교체한다.
- success exemplar review는 다음 stable release-bound closeout 1건이 더 쌓인 뒤에만 열고, blocker exemplar review는 새 blocked/smoke compliant note가 생겼을 때만 연다.
- success exemplar와 blocker exemplar는 역할을 나눠 유지한다.
  - success exemplar는 통과형 release bound closeout 기준선
  - blocker exemplar는 smoke/triage closeout 기준선
- Codex foreground exec처럼 장시간 build 세션이 잘릴 수 있는 환경에서는 `pnpm build` 재현보다 `pnpm build:detached`를 우선 사용하고, 출력된 exit json으로 최종 PASS/FAIL을 판정한다.
- 릴리즈 태그 기준 운영 (`v*`)
- dev 전용 기능은 production 차단 상태 유지

## Ops 캐시 점검 (Planning)
- 통합 상태는 `/ops/planning`에서 assumptions/regression/cache/store를 한 번에 확인할 수 있습니다.
- `/ops/planning-cache`에서 planning v2 캐시 엔트리/히트율을 확인할 수 있습니다.
- 만료 캐시 정리가 필요하면 `Purge expired`를 실행합니다.
