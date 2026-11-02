# 2026-10-06 Finance Astra Ultra / Sol Max 시험 적용

## 변경 파일

- `AGENTS.md`, `multi_agent.md`, `docs/finance-astra-sol-trial.md`
- `.codex/config.toml`, `.codex/agents/*.toml` 8개
- `scripts/run_codex_multi_agent.sh`, `scripts/multi_agent_handoff_guard.mjs`, `scripts/prompts/multi-agent/common.md`
- 이 종료 기록

## 사용 skill

- OpenAI Docs: 공식 모델/하위 에이전트/config 문서 확인
- codex-agent-rules-maintenance: native·CLI·역할·guard 일치와 권한 보존
- work-log-closeout: 실제 결과·한계 기록
- Personal Context: 기존 프로젝트 경로와 설정 작업 이력 확인 후 현재 원본으로 재검증

## 변경 이유

사용자가 Finance에 메인 Astra Ultra + 하위 Sol 6.1 Max 최대 6개 구성을 시험 요청했습니다. 기존 native 역할은 Sol 5.6/Terra, CLI 기본값도 이전 모델이어서 루트 config만 바꾸면 하위 역할이 이전 모델을 계속 사용합니다.

## 핵심 변경

- native 메인 `gpt-6-astra/ultra`, 하위 기본값·8역할 모두 `gpt-6.1-sol/max`.
- legacy `max_threads=4`를 canonical `max_concurrent_threads_per_session=6`으로 변경. depth=1·runtime=1800·기존 skill·sandbox·approval 보존.
- manager는 추가 생성 없이 메인에게 분업안을 반환하도록 역할 문안 정리.
- tmux lead Astra/ultra, 다른 역할 Sol/max; 각 독립 세션은 추가 native 위임 비활성. core=3/full=7과 native 하위 상한을 구별.
- 정확 모델/effort/root agents section을 guard로 검사하고 기존 tracking·handoff·skill·worklog 검사 보존.
- 제품 코드·실제 DB·설치본·전역 config·CLI·인증·provider·Git HEAD/index는 이 작업에서 변경하지 않음.

## 검증

### 실제 로컬 실행

- 최초 CLI 관찰 `0.153.4`: `codex debug models`에 요청 Sol 없음. read-only `codex exec --strict-config --model gpt-6.1-sol -c model_reasoning_effort="max"` 및 새 agents 키를 적용한 최소 호출은 400/exit 1.
- 이후 CLI `0.160.1`을 관찰. 작업자가 업데이트한 것은 아님. catalog에 Astra/ultra·Sol/max가 있었고 같은 최소 Sol 호출은 `FINANCE_SOL_MODEL_PROBE_OK`/exit 0.
- 활성 프로젝트에서 `codex exec --strict-config -C <finance> --sandbox read-only --json --color never -o <증거폴더>/native-smoke.final.txt -` 실행. model/effort 명령행 override 없이 analyzer와 reviewer를 1개씩 생성하여 설정 읽기·결과 통합. `FINANCE_NATIVE_MULTI_AGENT_SMOKE_OK`, exit 0, 42.55초.
- root thread `01a11176-782b-73f2-9b68-cd90aaf48422`의 runtime `turn_context`: `gpt-6-astra/ultra`.
- analyzer thread `01a11176-9ba4-7ba0-ba17-5353e2cf811c`, reviewer thread `01a11176-ae2a-7132-9f56-01eae83bfc3e`의 실제 작업 `turn_context`: 각각 `gpt-6.1-sol/max`. 부모의 상속 컨텍스트와 하위 작업 턴을 구분함.
- 실행 prompt·CLI 버전·정확 명령은 `native-smoke.request.json`, 결과는 stdout/result/final, 하위 metadata는 `native-smoke-runtime-models.json`에 기록.

### 설정과 독립 검토

- Python tomllib: 후보 9 TOML 파싱, 모델·effort·상한 및 기존 skill·권한 보존 PASS. Work 독립 검토는 원본/before/candidate 27개 TOML을 추가 대조.
- `bash -n scripts/run_codex_multi_agent.sh`, `node --check scripts/multi_agent_handoff_guard.mjs`, runner `--help`: PASS.
- 후보 full guard: 원본 Git index를 읽기 전용으로 참조하여 PASS. 활성 원본 `corepack pnpm multi-agent:guard`: PASS tracked=27 coverage=16.
- Work의 Astra Ultra 요청 총괄 아래 Sol Max 요청 하위 `native_roles_audit`, `runner_probe_audit` 2개가 독립 검토를 완료함. Work 요청값을 서버 실효 model metadata로 확대하지 않음.
- reviewer의 메모리 overlay guard 양성 PASS; wrong-main-model, wrong-main-effort, agents-disabled-with-skills-enabled, wrong-child-model, wrong-child-effort, wrong-role-effort, wrong-cli-lead-effort 7개 변이 모두 예상 FAIL(exit 1, 각 issues=1).
- `git diff --check` 변경 범위 PASS. 적용 직전 각 파일의 기준선 일치 및 Git index hash 확인.
- 관련 없는 tracked 4,260개 파일의 내용 보존은 최종 hash 검사로 확인.

## 미실행 검증

- 6개 동시 생성 부하검사, 8역할 각각의 실제 작업 실행, 기존 모델과 비용/속도/제품 완성도 A/B 비교
- tmux 세션 전체 실제 실행(명령 생성·문법·모델 분기 검토만 수행)
- 앱 전체 test/build/E2E, 실제 DB/restore/live API, 설치본 업데이트, 원격 CI·commit·push·배포

## 남은 리스크

- 새 세션에서 적용하며 기존 대화의 model/effort가 자동 전환됐다고 가정하지 않습니다. UI나 CLI 명시 override는 별도입니다.
- package guard가 기존 tracked 8/21 기록을 latest로 선택하는 현상이 있어 이번 새 기록은 경로·제목·필수 섹션을 별도로 직접 검사합니다. 이번 설정 범위를 넘어 해당 수집 로직은 바꾸지 않았습니다.
- pnpm 실행 환경은 package 요구 Node 22.22.2 대비 22.23.2 경고가 있었으나 이 guard는 통과했습니다. 의존성·런타임 버전을 이 작업에서 바꾸지 않았습니다.
- 이번 검증은 혼합 모델 구성과 읽기 전용 위임의 연결 확인이며 Finance 전체 품질이나 한도 절약을 증명하지 않습니다.

## 다음 라운드

- 다음 Finance 제품 작업은 새 세션에서 이 구성을 사용하고 실제 문제 한 건의 수정·검증 결과로 효용을 평가합니다.
- 백업 `finance-recovery/astra-sol-trial-20261006-223324/before`와 적용 manifest를 이용해 이번 delta만 식별합니다. 기존 dirty 변경을 되돌리거나 백업 전체로 덮지 않습니다.
