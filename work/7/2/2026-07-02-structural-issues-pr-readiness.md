# 2026-07-02 구조 Issue #114~#125 PR 준비 검증

## 변경 파일
- `work/7/2/2026-07-02-structural-issues-pr-readiness.md`

## 사용 skill
- `planning-gate-selector`: planning, route, public API, product/recommend, e2e 영향이 섞인 변경의 검증 게이트 선정
- `route-ssot-check`: route registry, `docs/current-screens.md`, production-hidden dev/debug surface 검증 기준 확인
- `work-log-closeout`: 검증 라운드 종료 기록 작성
- `github:yeet`: PR 생성 전 scope 확인, stage/commit/push/PR 작성 절차 확인
- `manager` subagent: merge 전 verification/PR readiness/issue close readiness 단계 분해

## 변경 이유
- 이전 라운드에서 #114~#125가 로컬 구현 완료로 보고됐으나, merge 전에는 실제 diff, 브랜치 상태, 검증 재현성, PR 단위, Issue 종료 가능성을 독립적으로 다시 확인해야 했다.
- 이번 라운드는 새 기능 구현이 목적이 아니므로 코드 변경 없이 검증, 산출물 정리, follow-up 분리, PR 준비 가능성 판단만 수행했다.

## 핵심 변경
- 현재 작업 브랜치가 `codex/p2-05-quality-gates`이고, 기존 PR은 없으며, #114~#125는 모두 OPEN임을 확인했다.
- tracked diff 197개 파일과 의도된 untracked 56개 파일을 PR 후보로 분리했다. untracked `work/6/*` 19개 과거 문서는 이번 #114~#125 PR 범위에서 제외한다.
- e2e 산출물 `.data/planning-e2e-122-review/`와 `.next-e2e-3142`는 workspace 내부 경로를 검증한 뒤 제거했다.
- public API 메시지 검색에서 내부 명령 문자열은 docs, tests, dev/ops 전용 UI, debug meta에 남아 있음을 확인했다. 일반 public message는 `src/lib/http/publicApiDiagnostics.ts`의 `PUBLIC_MESSAGES`로 분리되어 있다.
- samplebank는 `src/lib/products/samplebankPolicy.ts`에서 production 공개 접근을 차단하고, catalog UI에서는 non-production flag가 켜진 경우에만 `샘플 데이터 포함` 토글로 노출된다.
- `PlanningReportsDashboardClient`의 `<details open>` hydration mismatch를 `e2e:rc`에서 직접 확인했고, 기능 회귀는 없어 PR blocker가 아닌 follow-up으로 #126을 등록했다.

## 검증
- `pnpm typecheck`: 1차 FAIL, WSL non-login shell에서 `pnpm` PATH 없음. `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm typecheck`로 재실행 PASS.
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm typecheck`: PASS
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm lint`: PASS
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm test`: PASS, 753 files / 2496 tests
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm build`: PASS
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:ssot:check`: PASS
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planner:deprecated:guard`: PASS
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:user-scope:check`: PASS, 15 files / 88 tests
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:v2:guard`: PASS
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:v2:compat`: PASS
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:v2:complete`: PASS, 내부 freeze guard가 v2 core 변경을 감지해 `planning:v2:regress` 필요성을 표시
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:v2:regress`: PASS, 9 regression cases + full planning v2 e2e 8 passed
- `PORT=3142 PLANNING_DATA_DIR=.data/planning-e2e-122-review /home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm e2e:rc`: PASS, 24 passed / 1 skipped
- `git diff --check`: PASS
- `rg -n -e pnpm -e /api/dev -e snapshot/refresh -e "Run pnpm" -e scripts/ -e "\\.data/" src tests docs`: PASS로 판정. 내부 문자열 hit는 docs/tests/dev/ops/debug meta 문맥으로 확인
- `rg -n -e samplebank -e mock -e fallback -e replay -e 샘플 -e 모의 -e 대체 -e 임시 -e 기본값 src/app src/components src/lib tests docs`: PASS로 판정. samplebank production 공개 차단과 fallback/provenance 표시는 별도 contract/test로 확인

## 남은 리스크
- 현재 변경은 tracked 197개와 의도된 untracked 56개를 포함하는 대형 PR 후보이다. 검증은 통과했지만 리뷰 가능성 측면에서는 draft PR로 올린 뒤 도메인별 분리 리뷰가 바람직하다.
- `planning:v2:complete`가 `[v2-core-change]` tag 필요성을 표시했다. PR title 또는 본문에 해당 tag를 포함해야 한다.
- `PlanningReportsDashboardClient` hydration mismatch는 기능 회귀는 아니지만 React warning과 초기 disclosure 상태 불일치 가능성이 있어 #126 follow-up으로 분리했다.
- legacy route/API 삭제는 telemetry/access log와 실제 사용처 확인 전까지 닫지 않는 전제가 유지된다.
- public API debug meta와 console diagnostic에는 운영자 hint가 남아 있다. 일반 사용자 message에는 노출되지 않지만, debug flag 노출 경계는 계속 유지해야 한다.
