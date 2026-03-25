# Release Process (Local)

이 문서는 Planning v2 릴리즈의 표준 실행 절차를 요약합니다.

## Required Gates

필수:

1. `pnpm test`
2. `pnpm planning:v2:complete`
3. `pnpm multi-agent:guard`
4. `pnpm release:verify`

`release:verify`는 다음을 순차 실행합니다.

- `pnpm cleanup:next-artifacts -- --build-preflight`
- `pnpm planning:v2:complete`
- `pnpm multi-agent:guard`
- 추가 게이트가 스크립트에 존재하면 실행:
  - `pnpm planning:v2:compat`
  - `pnpm planning:v2:regress`
- `pnpm test`
- advisory:
  - `pnpm planning:ssot:check` (실패해도 WARN만 남고 required gate는 유지)
- 시작 단계의 `cleanup:next-artifacts -- --build-preflight`는 stale `.next-build*`와 대응 tsconfig/build metadata를 정리하고, tracked isolated build 내부 `standalone/.data` shadow도 같이 지웁니다.
- active build/prod/playwright runtime이 있으면 build-preflight용 `standalone/.data` 정리는 안전하게 skip 됩니다.
- 내부 `planning:v2:e2e:fast`와 `planning:v2:e2e:full`은 기존 dev/e2e webServer를 재사용하지 않도록 전용 포트와 고유 dist dir로 격리 실행합니다.
- `planning:v2:regress`는 전용 planning e2e data dir를 매번 새로 만들어 shared `.data/planning-e2e` 오염을 피합니다.

선택:

- `pnpm planning:v2:regress`
- 서버 실행 후 `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance`
- foreground build가 `143`으로 끊기는 환경이면 `pnpm build:detached`로 detached build 결과를 먼저 확인
- shared `.next` 또는 dev server 충돌을 피하려면 `pnpm build`, `pnpm e2e:rc`, `pnpm release:verify`는 메인 단일 소유자로 순차 실행

## Conditional Minor Guards

- `pnpm planning:v2:guard`
  - planning v2 architecture/local-only/privacy/security 경계를 직접 건드린 경우에만 conditional blocker로 붙입니다.
  - release bound 실행이면 결과를 release closeout에 남기고, change batch면 `/work`에 남깁니다.
- `pnpm planning:v2:engine:guard`
  - engine envelope/report contract/fallback 정리 시에만 conditional blocker로 붙입니다.
  - release bound 실행이면 결과를 release closeout에 남기고, change batch면 `/work`에 남깁니다.
- `pnpm planning:v2:freeze:guard`
  - v2 core 변경 visibility용 informational evidence입니다.
  - 종료코드는 0이며 release blocker가 아니므로 advisory record로만 남깁니다.

## Ops Cadence And Evidence

- `pnpm planning:v2:ops:run`, `pnpm planning:v2:ops:run:regress`, `pnpm planning:v2:ops:safety*`, `pnpm planning:v2:ops:scheduler:health`, `pnpm planning:v2:ops:prune`는 stable release blocker가 아닙니다.
- scheduled cadence 결과는 `docs/planning-v2-scheduler.md` 기준으로 `scheduler.ndjson`과 ops log에 남깁니다.
- 수동 change batch에서 위 명령을 실행했다면 release closeout 대신 `/work`에 요약을 남깁니다.

## Evidence Handoff Roles

- release closeout
  - stable release bound 실행의 대표 handoff입니다.
  - tracked `/work` note를 기본으로 하고, primary/companion final gate와 conditional minor guard 결과를 이 note에 남깁니다.
- advisory record
  - blocker가 아닌 WARN/정보성 결과를 적는 보조 블록입니다.
  - `pnpm planning:ssot:check`, `pnpm planning:v2:freeze:guard`, subset gate처럼 PASS/FAIL보다 참고 의미가 큰 결과를 분리해 남깁니다.
- scheduler/ops log
  - scheduled cadence와 raw ops evidence의 source of truth입니다.
  - `.data/planning/ops/logs/scheduler.ndjson`, `.data/planning/ops/logs/*.log`, `.data/planning/ops/reports/*.json`에 남기고 release closeout에는 요약과 위치만 적습니다.
- `/work` handoff
  - release bound가 아닌 수동 change batch의 요약 handoff입니다.
  - ops cadence 명령을 수동 실행했을 때 결과를 짧게 남기되, raw log를 복사하지 않고 evidence 위치만 연결합니다.

## Stable Release Closeout Template

- release closeout은 tracked `/work` note로 남깁니다.
- 파일명은 실제 release 검증 note 패턴을 따라 `work/<월>/<일>/YYYY-MM-DD-release-vX.Y.Z-main-verify.md`처럼 유지하는 편이 가장 안전합니다.
- 아래 순서를 기본 템플릿으로 사용합니다.

```md
# YYYY-MM-DD vX.Y.Z main 릴리즈 검증 정리

## 변경 파일
- release bound 변경 파일
- 코드 변경이 없으면 `- 추가 코드 변경 없음`

## 사용 skill
- 실제 사용한 skill만 기록

## 대상 릴리즈
- version / branch or worktree / release owner

## primary / companion final gate
- `pnpm release:verify`
- `pnpm build`
- `pnpm e2e:rc` (`실행한 경우만`)

## conditional minor guard
- 실행한 `pnpm planning:v2:guard`, `pnpm planning:v2:engine:guard`
- 왜 붙였는지
- 결과

## advisory record
- `pnpm planning:ssot:check`
- `pnpm planning:v2:freeze:guard`
- subset gate 또는 기타 non-blocking 결과

## evidence 위치
- scheduler/ops log: `.data/planning/ops/logs/scheduler.ndjson`
- ops log/report: `.data/planning/ops/logs/*.log`, `.data/planning/ops/reports/*.json`
- support bundle/추가 evidence가 있으면 경로만 기록

## 미실행 gate
- 실행하지 않은 gate
- 미실행 이유

## 검증
- 실제 실행한 명령과 결과

## 남은 리스크
- residual risk
- next owner / 다음 단계
```

- conditional minor guard는 실제로 실행한 경우에만 적습니다.
- advisory-only 명령은 release blocker와 섞지 말고 `advisory record` 블록에만 적습니다.
- ops cadence 명령은 release closeout의 본문 증거가 아니라 요약 대상입니다. raw output은 scheduler/ops log에 두고, closeout에는 위치만 적습니다.

## Tracked Release Note Quality Gate

- 앞으로 새로 쓰는 tracked release closeout note는 위 템플릿의 섹션을 같은 순서로 유지합니다.
- 코드 수정이 없는 라운드여도 `## 변경 파일`은 생략하지 않고 `- 추가 코드 변경 없음`처럼 명시합니다.
- `## primary / companion final gate`, `## conditional minor guard`, `## advisory record`, `## evidence 위치`, `## 미실행 gate`, `## 남은 리스크`는 누락 금지 섹션으로 봅니다.
- `pnpm release:verify`, `pnpm build`, `pnpm e2e:rc`, conditional minor guard처럼 blocker가 될 수 있는 결과는 advisory record와 섞지 않습니다.
- `pnpm planning:ssot:check`, `pnpm planning:v2:freeze:guard`, subset gate, ops cadence evidence는 `advisory record` 또는 `evidence 위치`에만 두고 blocker 서술에 끼워 넣지 않습니다.
- raw evidence 본문 복사 금지:
  - scheduler/ops log, support bundle, report json은 전체 출력 대신 경로와 한 줄 요약만 남깁니다.
- 실제로 실행하지 않은 gate는 `## 미실행 gate`에 이유와 함께 적습니다.
- 성공/실패와 무관하게 `## 남은 리스크`에는 residual risk와 next owner 또는 다음 단계를 남깁니다.
- note가 지나치게 짧아지지 않도록 `## 검증`에는 실제 명령과 결과를 함께 적고, `## evidence 위치` 또는 `## 남은 리스크` 중 하나에서 후속 확인 지점을 남깁니다.

## Tracked Exemplar Selection

- 성공형 exemplar
  - `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - release bound 라운드에서 primary/companion final gate가 필요한 범위까지 통과했고, advisory만 남았거나 residual risk만 정리하면 되는 경우 기준선으로 삼습니다.
- blocker/smoke exemplar
  - `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
  - smoke/triage 라운드이거나 첫 blocker 때문에 final gate 묶음이 중간에 멈췄고, 미실행 gate를 함께 정리해야 하는 경우 기준선으로 삼습니다.
- 선택 규칙
  - primary/companion final gate가 모두 통과했다면 advisory가 있어도 기본은 성공형 exemplar를 따릅니다.
  - 첫 blocker가 남아 있거나 blocker 때문에 required gate 일부를 실행하지 못했다면 blocker/smoke exemplar를 따릅니다.
  - 기존 exemplar와 헤더 문구를 그대로 복제할 필요는 없지만, gate/advisory/evidence 경계와 미실행 gate 표기는 같은 규칙을 유지합니다.

## Compliant Exemplar Adoption Status

- 2026-03-19 review 기준으로 first compliant exemplar가 있습니다.
  - template adoption 기준선: `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`
- 판정 근거
  - tracked `/work` release closeout note입니다.
  - current template 섹션을 같은 순서로 모두 유지합니다.
  - `blocker / advisory / evidence / 미실행 gate`를 서로 섞지 않았습니다.
  - raw evidence는 `.data/planning/eval/latest.json` 경로와 요약만 남기고 본문 복사를 피했습니다.
  - 실제 명령, 경로, PASS/FAIL, residual risk/next owner가 note 본문과 맞습니다.
- 현재 success/blocker exemplar는 legacy historical reference로 유지합니다.
  - 성공형 역할 reference: `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - blocker/smoke 역할 reference: `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
- legacy exemplar는 역할 참고용 기준선이고, current template 완전 준수 기준선은 위 first compliant exemplar가 맡습니다.
- first compliant exemplar가 생겨도 legacy exemplar를 즉시 교체하지는 않습니다.
  - compliant exemplar는 template adoption 기준선으로 먼저 씁니다.
  - 기존 success/blocker exemplar는 역할별 historical reference로 유지합니다.
  - 이후 success형과 blocker형을 각각 대체할 만큼 더 나은 compliant note가 쌓였을 때만 exemplar 교체를 다시 판단합니다.

## Exemplar Role Split

- template adoption 기준선
  - `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`
  - current template 섹션 순서, gate/advisory/evidence 분리, path-only evidence, residual risk/next owner 표기를 따라야 할 때 우선 기준으로 봅니다.
- success historical role reference
  - `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - stable release bound success closeout을 짧게 읽는 역할 reference로 유지합니다.
  - first compliant exemplar는 template adoption에는 더 적합하지만, success role reference는 release-story 가독성과 handoff 맥락까지 따로 봅니다.
- blocker/smoke historical role reference
  - `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
  - 첫 blocker, 미실행 gate, smoke/triage 맥락을 읽는 역할 reference로 유지합니다.

## Exemplar Role Review Trigger

- success role review는 다음 stable release-bound closeout이 1건 더 쌓였을 때만 엽니다.
  - 새 note가 tracked `/work` closeout이어야 합니다.
  - current quality gate를 완전히 만족해야 합니다.
  - 같은 소유자가 `pnpm release:verify`, `pnpm build`, 필요 시 `pnpm e2e:rc`까지 닫은 success형이어야 합니다.
  - legacy success exemplar보다 success closeout 흐름이 더 짧고 분명하거나, release handoff 맥락이 더 잘 보일 때만 교체 review를 엽니다.
  - 위 조건을 만족해도 template adoption 기준선과 success role reference는 독립적으로 판단합니다.
- blocker/smoke role review는 더 보수적으로 엽니다.
  - 새 blocked/smoke closeout이 tracked `/work` note여야 합니다.
  - current quality gate를 만족해야 합니다.
  - 첫 blocker, 미실행 gate, advisory/evidence 분리가 현재 blocker exemplar보다 더 명확할 때만 교체 review를 엽니다.
  - success형 compliant note가 추가로 생겼다는 이유만으로 blocker exemplar review를 열지 않습니다.

## Example Mapping

- 성공 예시
  - `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - release bound 변경과 `pnpm release:verify` 재실행이 함께 있었던 closeout 예시다.
- blocker/smoke 예시
  - `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
  - 코드 수정 없이 `pnpm release:verify` smoke를 돌리고 첫 blocker와 미실행 검증을 남긴 예시다.
- 읽는 방법
  - `pnpm release:verify`, `pnpm build`, 필요 시 `pnpm e2e:rc`는 `primary / companion final gate`에 적는다.
  - conditional minor guard는 실제로 실행했을 때만 별도 블록에 적고, 실행하지 않았으면 새 항목을 만들지 않는다.
  - advisory-only 결과는 blocker와 합치지 않고 `advisory record`에만 적는다.
  - raw ops evidence는 본문에 복사하지 않고 `.data/planning/ops/logs/`, `.data/planning/ops/reports/` 경로만 남긴다.
  - blocker가 있으면 `첫 blocker`와 `미실행 gate`를 분리하고, 성공 케이스면 `residual risk / next owner`만 짧게 남긴다.

## Prepare

버전 준비:

1. `pnpm release:prepare -- --bump=patch` (또는 `minor`, `major`)
2. 스크립트 동작:
   - `release:verify` 선실행
   - `pnpm version <bump> --no-git-tag-version` 실행
   - `CHANGELOG.md` 존재 보장 및 신규 버전 스텁 추가
   - `package.json` 내 `--version=x.y.z` 파라미터 동기화
3. `CHANGELOG.md` 스텁을 실제 변경사항으로 보강

## Tag & Rollback

태그 규칙:

- 커밋: `chore(release): vX.Y.Z`
- 태그: `vX.Y.Z`

롤백:

1. 직전 안정 태그로 코드 복구
2. `/ops/backup` 백업 복원
3. `/ops/doctor` 상태 확인
4. 필요 시 migration 복구 (`planning:v2:migrate:*`)
5. `pnpm release:verify` 재실행

상세 체크 항목은 [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md)를 기준으로 합니다.
