# 2026-03-12 release/runtime 인프라 배치 계획

## 변경 파일
- `work/3/12/2026-03-12-release-runtime-infra-batch-plan.md`

## 사용 skill
- `planning-gate-selector`: release/runtime 스크립트 배치에서 최종 검증 소유권과 최소 게이트 축을 정리하는 데 사용.
- `work-log-closeout`: 이번 라운드 계획 메모를 현재 `/work` 형식에 맞춰 남기는 데 사용.

## 변경 이유
- 사용자는 release/runtime 인프라 범위에서 build/dev/prod/e2e runtime 노이즈를 줄이는 다음 최소 수정 후보를 3~5단계로 분해해 달라고 요청했다.
- 최신 `/work` 기준으로 `cleanup helper`, `build/prod distDir`, `e2e isolation`, `Windows bridge`는 대부분 닫혔고, 남은 축은 `single-owner preflight/cleanup 순서`, `release:verify` 진입점 연결, wrapper 로그 정리, `next.config.ts`의 글로벌 runtime 계약 점검이다.

## 핵심 변경
- 오늘 최신 관련 문서로 `build-prod-distdir-runtime`, `cleanup-build-artifact-policy`, `release-gate-e2e-isolation`, `final-verification-single-owner-guard`, `windows-localhost-bridge-simplification` closeout을 재확인했다.
- 현재 코드 기준으로 `package.json`의 `release:verify`는 `cleanup:next-artifacts` preflight를 직접 호출하지 않고, `pnpm build`/`pnpm start`는 각각 `next_build_safe`/`next_prod_safe` wrapper를 통한다는 점을 확인했다.
- `next_build_safe`/`next_prod_safe`/`next_dev_safe`/`next_artifact_prune`/`next.config.ts`를 다시 읽어 active runtime guard, isolated distDir, standalone asset link, bridge 로그, global distDir/tsconfig 계약을 재확인했다.
- 이번 라운드 산출물은 구현이 아니라 메인 에이전트 우선순위와 병렬 가능 범위를 나눈 4단계 배치 계획이다.

## 검증
- `find work -maxdepth 3 -type f -name '*.md' | sort`
- `rg -n "pnpm (build|test|lint|e2e:rc)|next build|release_verify|cleanup:next-artifacts|latest verification|검증" work docs . -g '!node_modules' -g '!dist' -g '!*coverage*'`
- `rg --files | rg '(^|/)(scripts/next_.*|release_verify|next\\.config|cleanup|multi_agent\\.md|docs/current-screens\\.md)$'`
- `ls -lt work/3/12 | head -n 20`
- `sed -n '1,220p' multi_agent.md`
- `sed -n '1,220p' work/3/12/2026-03-12-build-prod-distdir-runtime-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-release-gate-e2e-isolation-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-cleanup-build-artifact-policy-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-final-verification-single-owner-guard.md`
- `rg -n "release:verify|build:detached|cleanup:next-artifacts|next_build_safe|next_dev_safe|next_prod_safe|next_artifact_prune" package.json pnpm-lock.yaml -S`
- `sed -n '1,260p' scripts/next_build_safe.mjs`
- `sed -n '1,260p' scripts/next_dev_safe.mjs`
- `sed -n '1,260p' scripts/next_prod_safe.mjs`
- `sed -n '1,260p' scripts/next_artifact_prune.mjs`
- `sed -n '1,260p' next.config.ts`
- `sed -n '1,220p' /home/xpdlqj/code/finance/.codex/skills/planning-gate-selector/SKILL.md`
- `sed -n '1,220p' /home/xpdlqj/code/finance/.codex/skills/work-log-closeout/SKILL.md`

## 남은 리스크
- 이번 라운드는 계획 메모만 남겼고, `pnpm build`, `pnpm release:verify`, `pnpm e2e:rc`, `pnpm planning:v2:prod:smoke`는 새로 실행하지 않았다.
- 최신 closeout 기준 구현 blocker는 없지만, `release:verify` preflight 부재와 wrapper 로그 중복은 여전히 남아 있을 수 있다.
- `next.config.ts`는 글로벌 계약이므로, 실제 수정 전에는 wrapper env와 raw Next 동작 차이를 다시 한 번 좁게 분리해야 안전하다.

## 이번 라운드 완료 항목
- 최신 `/work`와 최근 검증 결과에서 runtime/release 인프라 관련 남은 축을 재정리했다.
- 현재 코드 기준으로 바로 수정 가능한 핵심 경로와 병렬 조사 가능한 주변 경로를 나눌 수 있는 상태를 만들었다.

## 다음 라운드 우선순위
- 메인 에이전트가 `single-owner preflight -> release gate 연결 -> wrapper 로그 정리 -> 최종 게이트` 순서로 작은 batch를 시작
- 보조 에이전트는 `next.config.ts` 글로벌 계약 점검, wrapper 로그 중복 분류, 좁은 smoke 재현까지만 병렬 배정
