# 2026-08-02 GitHub 게시 배치 merge 완료 계약

## 변경 파일

- `AGENTS.md`: 명시적으로 승인된 GitHub 게시 배치는 PR에서 멈추지 않고 merge까지 진행하는 공통 계약 추가
- `multi_agent.md`: 일괄 승인 범위, merge 완료 조건, 우회 금지, merge 대기·재개와 사후 기록 상세화
- `scripts/prompts/multi-agent/common.md`: CLI 전체 역할에 같은 merge 완료 계약 전달
- `work/8/2/2026-08-02-github-publication-batch-merge-followthrough.md`: 이번 후속 변경과 검증 결과 기록

## 사용 skill

- `finance-skill-routing`: 후속 agent-rule 변경에 필요한 최소 skill 조합을 다시 선택했습니다.
- `codex-agent-rules-maintenance`: 공통 규칙과 CLI 프롬프트의 권한·완료 계약을 일치시켰습니다.
- `planning-gate-selector`: 문서·멀티 에이전트 규칙 변경에 맞는 최소 검증을 선정했습니다.
- `openai-docs`: 같은 작업에서 갱신한 공식 Codex manual을 재사용해 `AGENTS.md`의 지속 규칙 범위와 외부 부작용 승인 경계를 확인했습니다.
- `work-log-closeout`: 실제 변경과 실행한 검증, 미실행 검증, 잔여 위험을 표준 형식으로 기록했습니다.

## 변경 이유

- 사용자가 GitHub 게시 배치를 PR 생성에서 끝내지 않고 merge까지 반드시 진행하는 완료 계약으로 바꾸도록 요청했습니다.
- 기존 규칙은 push와 PR까지는 명시했지만, merge를 한 번의 승인 범위와 최종 완료 조건으로 고정하지 않았습니다.

## 핵심 변경

- GitHub 게시 배치 진행의 명시적 요청은 commit, push, PR, 필수 checks 확인, 허용된 merge까지의 일괄 승인으로 정의하되, 같은 요청의 `push only`·`draft PR only`·`merge 금지` 제한이 우선하도록 했습니다.
- PR 생성은 완료가 아니며, 대상 branch·required checks·요청된 review·충돌 여부를 확인하고 merge해야 게시 배치가 완료됩니다.
- force push, admin bypass, branch protection 우회, 실패한 required check를 무시한 merge는 수행하지 않도록 안전 경계를 유지했습니다.
- 안전한 merge가 불가능하면 외부 단계를 `[blocked: merge 대기]`로 남기고 로컬 작업을 계속합니다. 조건 해소 후 PR head·base·diff·review·checks가 승인 범위와 같을 때만 추가 확인 없이 merge를 재개하며, 범위가 달라지면 새 승인을 받습니다.
- merge 후 PR, merge 결과, merge commit, 확인한 checks를 `/work`에 남기도록 했고, 이번 후속 작업에서는 실제 GitHub 외부 작업을 수행하지 않았습니다.

## 검증

- `wsl.exe -d Ubuntu -- bash -lc 'cd /home/xpdlqj/code/finance && /home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm multi-agent:guard'`: PASS (`tracked=25`, `coverage=16`)
- `wsl.exe -d Ubuntu -- bash -lc 'cd /home/xpdlqj/code/finance && git diff --check -- AGENTS.md multi_agent.md scripts/prompts/multi-agent/common.md'`: PASS
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- rg -n -F -e '한 번에 승인' -e 'PR 생성은 완료가 아니다' -e '[blocked: merge 대기]' -e '승인 범위와 같은지' -e 'force push' -e 'merge 후에는' AGENTS.md multi_agent.md scripts/prompts/multi-agent/common.md`: PASS, 세 문서의 merge 완료 계약 확인
- `.codex/config.toml`과 `.codex/agents/*.toml` 9개를 Python `tomllib`으로 파싱: PASS
- 활성 agent 설정·프롬프트의 `gpt-5.4`, `gpt-5.5` 검색: 일치 없음
- 활성 agent 규칙의 광범위한 `간결하게`, `최소한으로`, `concise` 검색: 일치 없음
- 전역·저장소 `AGENTS.md` 합계 33,913 bytes, 설정 한도 65,536 bytes 이내: PASS
- 독립 reviewer: PR-only 범위 과확대, 대기 상태 표기, 재개 전 stale 승인 재검증 누락을 반영한 뒤 추가 actionable finding 없음
- 독립 tester: 대상 diff 공백 검사, 고정 pnpm 경로의 guard, 핵심 문구 동기화 확인 PASS
- 제품 코드와 런타임 경로를 바꾸지 않아 `pnpm lint`, `pnpm test`, `pnpm verify`, `pnpm build`, `pnpm e2e:rc`는 실행하지 않았습니다.

## 남은 리스크

- 실제 GitHub branch protection, required checks, review 요구, merge 권한과 API 동작은 다음 게시 배치에서 원격 상태를 확인해야 합니다.
- merge까지의 일괄 승인은 명시적인 GitHub 게시 배치 요청에 적용되며, 같은 요청의 직접 범위 제한과 보호 규칙 우회 금지가 우선합니다.
- 새 지속 규칙은 trusted project의 새 Codex 실행부터 확실히 적용됩니다.
- 작업트리에는 이번 범위 밖의 기존 미커밋 변경이 다수 있으며 모두 보존했습니다.

## 다음 라운드 우선순위

- 다음에 GitHub 게시가 명시적으로 요청되면 PR 생성에서 완료 처리하지 않고 required checks와 merge 결과까지 확인합니다.
- 원격 장애로 `[blocked: merge 대기]`가 되면 상태가 바뀌기 전 반복 재시도는 피하고, 조건 해소 후 승인 범위가 같은지 재검증한 뒤 merge를 재개합니다.
