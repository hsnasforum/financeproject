# 2026-10-07 Finance Codex 하네스 단순화

## 변경 파일

원본 `/home/xpdlqj/code/finance`, branch `main`, HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`에 검증된 하네스 delta를 적용했습니다.

- 지침: `AGENTS.md`, `multi_agent.md`
- 설정·정책: `.codex/config.toml`, `.codex/rules/default.rules`
- 역할: `.codex/agents/*.toml` 8개
- 스킬: `finance-skill-routing`, `planning-gate-selector`, `work-log-closeout`, `codex-agent-rules-maintenance`의 `SKILL.md`
- 실행·검사: `scripts/run_codex_multi_agent.sh`, `scripts/multi_agent_handoff_guard.mjs`
- CLI 역할 prompt: `scripts/prompts/multi-agent/*.md` 8개
- 문서: `docs/finance-astra-sol-trial.md`
- 기록: 이 파일

적용 직전 대상 기존 파일 27개가 감사 시작 체크섬과 모두 일치하는지 확인했고, 복구본을 `/home/xpdlqj/finance-recovery/codex-harness-preapply-20261007-132722`에 만든 뒤 27개 기존 파일과 이 기록 1개만 반영했습니다. commit·push·PR·merge·deploy는 하지 않았습니다.

## 사용 skill

- `codex-agent-rules-maintenance`: Codex 설정·역할·runner·guard·rules 정합성 기준.
- `finance-skill-routing`: 이번 작업에 필요한 로컬 스킬만 선택.
- `planning-gate-selector`: 제품 build/E2E 대신 하네스에 직접 대응하는 검증 범위 선택.
- `work-log-closeout`: 실제 변경·검증·미검증을 이 기록 하나로 정리.

## 변경 이유

강한 모델 조합 자체보다 항상 로드되는 긴 AGENTS와 역할·스킬 사이의 반복 절차가 컨텍스트와 실행 비용을 키우는 문제를 줄이는 것이 목적입니다. 중간 후보에서 Sol/Luna 효율형 라우팅을 시험했으나, 사용자 목표가 비용 절감보다 결과 품질 우선임을 재확인해 최종 정책은 **Astra Ultra 메인 + Sol 6.1 Max 서브**를 유지하고 하네스만 가볍게 만드는 방향으로 확정했습니다.

이 모델 조합은 Finance의 품질 우선 프로젝트 선택이며 모든 Codex 작업에 대한 OpenAI의 단일 의무 설정으로 표현하지 않습니다.

## 핵심 변경

- 메인 `gpt-6-astra / ultra`, 기본 subagent `gpt-6.1-sol / max`.
- manager/analyzer/planner/developer/reviewer/tester/documenter/researcher 8개 native 역할은 모두 `gpt-6.1-sol / max`; 기존 역할별 read-only/workspace-write와 `approval_policy=on-request`는 유지.
- 동시 하위 최대 6, depth 1, runtime 1800초는 유지하되 상한을 채우지 않고 독립 분할 가치가 있을 때만 생성.
- CLI tmux는 lead=Astra Ultra, 나머지 implementer/planner/researcher/reviewer/validator/documenter=Sol 6.1 Max, 각 세션 `agents.enabled=false`.
- `AGENTS.md`는 19,271B/182줄 → 9,665B/60줄, `multi_agent.md`는 약 절반 수준으로 축소. 금융 수치·출처, 인증/owner 격리, Desktop Local 단일 writer, backup/restore, 외부 데이터 provenance, dev/debug 비노출, Git·외부 변경 승인 불변식은 보존.
- 네 핵심 스킬을 progressive disclosure 중심으로 축소하고 `project_doc_max_bytes=32768` 적용.
- `.rules`는 pnpm 검증 allow를 유지하고 `git commit/push/merge/rebase/reset/clean`, `gh pr create/merge`를 prompt로 올림. 절대 보안 경계로 표현하지 않음.
- 과거 Astra Ultra/Sol Max 시험은 역사 기록으로 보존하고, 현재는 같은 모델 조합에 경량 하네스를 결합한 정책으로 구분.

## 검증

- 원본 적용 전 대상 27개 파일 checksum drift: 0.
- 적용 후 원본 27개가 후보와 byte 단위 일치: mismatch 0.
- Python `tomllib`: `.codex/config.toml` + 역할 TOML 8개, 총 9개 PASS.
- 변경 스킬 4개 `quick_validate.py`: 모두 PASS.
- `node --check scripts/multi_agent_handoff_guard.mjs`: PASS.
- `bash -n scripts/run_codex_multi_agent.sh`: PASS.
- `corepack pnpm multi-agent:guard`: PASS (`tracked=29`, `coverage=17`). Node 요구 22.22.2 대비 실행 환경 22.23.2라 engine warning이 있었고 pnpm은 9.15.9.
- `git diff --check`: PASS.
- `codex execpolicy check`: `pnpm test` allow, `git push`·`gh pr merge` prompt 확인. 후보 단계에서 commit/merge/rebase/reset/clean/pr create도 prompt 확인. 실제 Git/PR 명령은 실행하지 않음.
- 원본 Codex CLI 0.160.1 `--strict-config` 실제 호출: exit 0, 메인 `gpt-6-astra / ultra` 로드 확인.
- 원본 native subagent 실제 호출:
  - 부모 thread `01a1149e-8179-7150-ade3-e95a265c93b1`: `gpt-6-astra / ultra`
  - analyzer thread `01a1149e-a08a-7d00-a83e-5ae0db06e03e`: `agent_role=analyzer`, 실제 작업 turn `gpt-6.1-sol / max`
  - reviewer thread `01a1149e-b306-7fb1-972a-7071445a85b4`: `agent_role=reviewer`, 실제 작업 turn `gpt-6.1-sol / max`
- 감사 시작 상태와 비교 시 새 Git status 항목은 이 untracked 작업 기록 1개뿐입니다. `middleware.ts` 삭제는 작업 시작 전부터 존재한 기존 상태이며, 초기 clone+rsync 사본에 HEAD 파일이 남아 전체 해시 비교에서 1건의 false positive로 나타났습니다.
- 전체 앱 build/E2E, live API, 실제 DB 쓰기, desktop install, 비용·속도 벤치마크는 실행하지 않았습니다.

## 남은 리스크

- REFUGE DEV BRIDGE 격리 Task는 isolated workspace policy 미등록으로 실행되지 않아 별도 로컬 격리 사본에서 후보를 먼저 만들었습니다.
- Codex `workspace-write` sandbox는 `.codex/` 자기수정을 read-only로 보호했습니다. 권한 우회 없이 격리 사본에서 해당 설정 후보를 직접 작성한 뒤 검증하고, 원본 적용 전 checksum gate를 거쳤습니다.
- 실제 subagent 런타임은 analyzer/reviewer 2개 역할을 대표 표본으로 확인했습니다. 8개 역할 동시 부하·비용 시험은 하지 않았습니다.
- `.rules` prompt는 승인 검토 보조 수단이며 shell wrapper나 다른 Git/API 경로를 모두 절대 차단하지 않습니다.
- 현재 working tree에는 이번 작업 전부터 많은 미커밋 변경이 있으며 그대로 보존했습니다.

## 다음 라운드

하네스 원본 반영과 대표 런타임 검증은 완료됐습니다. 다음 실제 Finance 개발 작업에서 **Astra Ultra 총괄 + 필요한 수의 Sol 6.1 Max 서브 + 경량 AGENTS/Skills**가 중복 조사·중복 검증을 줄이면서 제품 결과 품질을 높이는지 관찰하면 됩니다. 문제가 확인될 때만 역할 수·effort·라우팅을 다시 조정합니다.
