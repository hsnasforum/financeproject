# 2026-08-02 GitHub 게시 배치 정책 보완

## 변경 파일

- `.codex/config.toml`: 전역·저장소 `AGENTS.md` 합산 지침을 온전히 읽도록 `project_doc_max_bytes = 65536` 추가
- `AGENTS.md`: 로컬 라운드 기록과 GitHub 게시 단위를 분리하는 저장소 공통 계약 추가
- `multi_agent.md`: 10~15개 게시 목표, 원격 장애 처리, 조기 분할 예외, 게시 직전 게이트 상세화
- `scripts/prompts/multi-agent/common.md`: CLI 전체 역할에 같은 게시·중단·권한 경계 전달
- `work/8/2/2026-08-02-github-publication-batch-policy.md`: 이번 변경과 검증 결과 기록

## 사용 skill

- `finance-skill-routing`: agent-rule 변경에 필요한 최소 skill 조합을 선택했습니다.
- `codex-agent-rules-maintenance`: 공통 규칙, CLI 프롬프트, 설정 한도와 검증 기준의 정합성을 유지했습니다.
- `planning-gate-selector`: 문서·멀티 에이전트 설정 변경에 맞춰 최소 검증 세트를 선택했습니다.
- `openai-docs`: 공식 Codex manual에서 `AGENTS.md` 적용 범위와 `project_doc_max_bytes` 설정을 확인했습니다.
- `work-log-closeout`: 실제 변경, 실행 검증, 미실행 검증과 다음 우선순위를 표준 형식으로 남겼습니다.

## 변경 이유

- 작은 작업마다 GitHub push와 PR을 반복하면 현재 `.github/workflows/ci.yml`의 push·pull request 실행과 `.github/workflows/e2e-smoke.yml`의 pull request 실행이 자주 발생할 수 있습니다.
- 내부 `/work` 기록은 기존처럼 작은 라운드별로 유지하면서, GitHub Actions billing이나 원격 장애 때문에 로컬 구현·검증·문서화까지 멈추지 않는 별도 게시 주기가 필요했습니다.

## 핵심 변경

- 로컬 완료 항목은 구현, 필요한 로컬 검증, `/work` 기록까지 마친 단위로 정의했습니다.
- GitHub 게시 배치는 같은 목적·의존성·검증·롤백 경계의 완료 항목 10~15개를 목표로 하되 강제 개수로 사용하지 않습니다.
- billing·quota·runner·권한·원격 CI 문제는 외부 단계만 게시 또는 검증 대기로 남기고, 원격 재시도 없이 다음 안전한 로컬 라운드를 계속하게 했습니다.
- 보안·production·release·rollback·충돌·리뷰 가능성 예외와, 명시적 외부 완료 조건일 때 해당 산출물만 `[blocked]`로 남기는 경계를 추가했습니다.
- 게시 목표가 자동 commit·push·PR 권한을 만들지 않도록 기존 승인 계약을 유지했고, 이번 라운드에서도 GitHub 게시 작업은 수행하지 않았습니다.
- 전역·저장소 `AGENTS.md` 합계 33,485 bytes가 기본 32 KiB를 넘으므로 프로젝트 한도를 65,536 bytes로 높였고 현재 여유는 32,051 bytes입니다.

## 검증

- `wsl.exe -d Ubuntu -- bash -lc 'cd /home/xpdlqj/code/finance && /home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm multi-agent:guard'`: PASS (`tracked=25`, `coverage=16`)
- `$tomlCode = "import pathlib,tomllib; files=[pathlib.Path('.codex/config.toml'),*sorted(pathlib.Path('.codex/agents').glob('*.toml'))]; [tomllib.loads(p.read_text(encoding='utf-8')) for p in files]; print(f'TOML PASS files={len(files)}')"; wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- python3 -c $tomlCode`: PASS (9개 TOML)
- `wsl.exe -d Ubuntu -- bash -lc 'cd /home/xpdlqj/code/finance && git diff --check -- .codex/config.toml AGENTS.md multi_agent.md scripts/prompts/multi-agent/common.md'`: PASS
- `git diff --no-index --check -- /dev/null work/8/2/2026-08-02-github-publication-batch-policy.md`: 공백 오류 0건, 신규 파일 차이로 예상된 종료 코드 1
- 종료 기록 제목과 `변경 파일 / 사용 skill / 변경 이유 / 핵심 변경 / 검증 / 남은 리스크 / 다음 라운드 우선순위` heading 검색: PASS
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- rg -n -F -e '10~15' -e 'billing' -e '[GitHub 게시 대기]' -e '[원격 검증 대기]' -e '[blocked]' -e '자동 Git 권한' AGENTS.md multi_agent.md scripts/prompts/multi-agent/common.md`: PASS, 세 문서의 핵심 계약 확인
- 활성 agent 설정·프롬프트의 `gpt-5.4`, `gpt-5.5` 검색: 일치 없음
- 활성 agent 규칙의 광범위한 `간결하게`, `최소한으로`, `concise` 검색: 일치 없음
- 독립 reviewer: `[blocked]` 경계와 조기 분할 예외 누락 1건을 반영한 뒤 최종 finding 없음
- 독립 tester: 대상 문서 공백 검사, 직접 guard, workflow trigger 확인 PASS
- 제품 코드와 런타임 경로를 바꾸지 않아 `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e:rc`는 실행하지 않았습니다.

## 남은 리스크

- 새 프로젝트 설정과 지침은 trusted project의 새 Codex 실행부터 확실히 적용됩니다. 현재 실행에서 지침 재로딩을 위한 별도 모델 호출은 하지 않았습니다.
- 10~15개 게시 목표는 문서·프롬프트 계약이며 별도 정규식 guard로 강제하지 않습니다. 응집성·리뷰 가능성·긴급 예외가 숫자보다 우선합니다.
- 현재 GitHub Actions billing 계정 상태 자체는 확인하지 않았습니다. 이 변경은 billing을 해결하는 것이 아니라 원격 문제의 영향 범위를 게시 단계로 제한합니다.
- 작업트리에는 이번 범위 밖의 기존 미커밋 변경이 다수 있으며 모두 보존했습니다.

## 다음 라운드 우선순위

- 다음 로컬 작업도 작은 단위로 검증하고 `/work`에 기록하되, 게시 후보는 같은 목적의 완료 항목과 관련 `/work` 경로를 누적합니다.
- 사용자가 GitHub 게시를 명시적으로 요청한 시점에 배치 manifest와 통합 검증을 확인하고, billing 상태가 그대로면 원격 작업을 반복 재시도하지 않습니다.
