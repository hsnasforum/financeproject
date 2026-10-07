# Finance Codex 모델 정책과 과거 시험

## 2026-10-07 기본 정책과 적용 상태

이 사본의 native config·agents·rules·skills와 CLI runner는 아래 기본 정책을 사용합니다. 실제 파일의 최종 검증 상태는 `work/10/7/2026-10-07-codex-harness-simplification.md`를 참조합니다.

현재 Finance 기본값은 메인 gpt-6-astra ultra, 기본 subagent와 8개 역할 gpt-6.1-sol max입니다. 동시 하위 최대 6·depth=1은 유지하되 상한을 채우지 않고 독립 분할의 가치가 있을 때만 생성합니다. CLI tmux도 lead=Astra Ultra, 나머지 역할=Sol 6.1 Max로 맞춥니다. 권한·검증 계약은 multi_agent.md를 참조합니다.

`project_doc_max_bytes=32768`과 축약된 AGENTS/Skills/Rules를 사용합니다. 모델은 품질 우선 프로필로 Astra Ultra + Sol 6.1 Max를 유지하되, 하네스 컨텍스트와 불필요한 역할 호출을 줄입니다. 파일 설정과 정적 검증은 실제 모델 호출의 근거와 구분합니다.

Astra Ultra는 현재 Finance의 기본 총괄이며 Sol 6.1 Max는 하위 작업 기본값입니다. 강한 모델을 쓰는 것과 많은 에이전트를 항상 호출하는 것은 별개이며, 단순 작업은 메인 단독으로 끝냅니다. 모델 선택 자체가 추가 실행 권한을 만들지 않습니다.

설정 파일 저장은 현재 세션을 전환하지 않습니다. Work의 모델 선택·요청 인자와 로컬 CLI config·실행 기록은 별도 근거입니다. 새 설정의 파싱/정적 검증과 실제 model 호출 검증을 구분합니다.

## 공식 지침 요약 — 2026-10-07 사용자 제공

이번 작업은 사용자 제공 요약을 기준으로 했으며 웹 검색은 하지 않았습니다. 과거 시험의 링크와 실행 결과는 아래 당시 기록에 보존합니다.

- 모델: 공식 문서는 품질·비용·지연 요구에 맞춰 모델과 effort를 선택하도록 안내합니다. Finance는 현재 비용보다 결과 품질을 우선해 Astra Ultra 총괄 + Sol 6.1 Max 하위 조합을 프로젝트 기본으로 선택합니다.
- 역할: 책임을 좁게 정의하고 모델·effort·sandbox를 역할에 맞춥니다.
- AGENTS: 항상 로드되는 지침과 기본 32KiB 한도를 고려합니다.
- Skills: 짧은 description과 필요할 때만 읽는 본문을 사용합니다.
- Rules: prefix_rule의 allow/prompt/forbidden을 사용하며 sandbox 내부 모든 명령을 차단하는 보장으로 해석하지 않습니다.

아래는 당시 작업자가 남긴 시험 결과입니다. 현재 기본값이나 이번 실행에서 재확인한 결과로 취급하지 않습니다.

---

# 2026-10-06 Astra Ultra / Sol Max 시험 기록

기준일: 2026-10-06. 사용자 요청에 따라 Finance 프로젝트에 혼합 모델 구성을 적용했습니다.

## 당시 적용값

| 대상 | 모델 | 추론 강도 |
| --- | --- | --- |
| 새 native 메인 | `gpt-6-astra` | `ultra` |
| native 하위 기본값과 8개 역할 | `gpt-6.1-sol` | `max` |
| CLI tmux lead | `gpt-6-astra` | `ultra` |
| CLI tmux 나머지 역할 | `gpt-6.1-sol` | `max` |

하위 동시상한은 **6개**이며 항상 여섯 개를 생성한다는 뜻이 아닙니다. 기존 depth=1·runtime=1800과 역할별 sandbox·approval·skill을 보존했습니다. native manager도 하위 역할이며 추가 생성 대신 메인에게 분업안을 반환합니다.

## 당시 사용 방식

당시 Finance 폴더에서 새 Codex 세션을 시작하면 아래 시험 config를 읽었습니다. 이미 실행 중인 세션의 모델이 파일 저장만으로 바뀌었다고 가정하지 않습니다. 명시적 CLI 모델/effort override나 앱 UI의 선택이 있으면 실제 선택값을 확인합니다.

Work에서 실행할 때는 메인 Astra Ultra를 선택하고, 이 시험을 요청한 작업의 하위 생성에는 실제 도구가 지원하는 `model=gpt-6.1-sol`, `reasoning_effort=max`를 명시합니다. 원격으로 읽은 로컬 config가 현재 클라우드 Work 대화에 자동 반영된다고 가정하지 않습니다. 새 컨텍스트에서 모델 지정이 가능한 도구 형태를 사용합니다.

조사·검토는 읽기 전용, 구현 파일은 한 시점에 한 소유자, 공유 build·DB·port·Git index·최종 검증은 메인 단일 소유입니다. 하위 재위임을 금지하고 필요한 수만 생성합니다.

tmux runner는 core=3/full=7개 **독립 CLI 세션**을 실행합니다. native 자동 위임 트리와 다릅니다. 각 세션에 `agents.enabled=false`를 전달해 추가 생성을 막습니다. 기존 env 재정의에 `CODEX_LEAD_MODEL`이 추가됐으며, 명시적으로 기본값을 바꾼 실행은 이 조합의 검증으로 취급하지 않습니다.

## 실제 확인

- 로컬 CLI 0.160.1에서 새 config를 읽은 메인 → analyzer·reviewer 2개 생성 → 읽기 → 결과 통합이 exit 0으로 끝났습니다. 명시적 모델 override 없이 역할 기본값을 사용했습니다.
- 실행기가 남긴 원본 세션의 `turn_context`: 메인 `gpt-6-astra/ultra`, 두 하위의 실제 작업 턴은 각각 `gpt-6.1-sol/max`였습니다.
- 하위 기록에는 상속받은 부모 컨텍스트도 있으므로 첫 model 문자열만 보고 판단하지 않습니다. 해당 하위의 작업 턴을 확인합니다.
- Work에서도 Astra Ultra로 요청한 총괄이 Sol Max로 요청한 하위 2개를 생성해 독립 검토를 완료했습니다. Work의 요청 인자·생성 결과와 로컬 실행기의 모델 기록은 별도 근거입니다.
- TOML·shell·Node 문법, 후보 및 활성 `multi-agent:guard`, 프로필 양성·음성 7종, diff 검사를 확인했습니다.
- 여섯 하위를 동시에 실행하는 부하검사, 비용·속도 우열 비교, Finance 제품 전체 테스트는 이번 설정 시험 범위가 아닙니다.

## 초기 오류와 재검증

처음 확인한 CLI 0.153.4에서는 같은 Sol 모델 호출이 HTTP 400으로 거부됐습니다. 검증 도중 CLI가 0.160.1로 바뀐 것을 관찰했고, 새 버전의 catalog와 실제 호출 성공을 확인한 뒤 적용했습니다. 이 작업에서는 CLI·전역 config·인증·provider·권한을 변경하지 않았습니다. 초기 오류를 모든 계정이나 현재 버전의 제한으로 일반화하지 않습니다.

## 보존과 근거

적용 전 파일·기존 dirty 상태·검증 자료는 저장소 밖의 `finance-recovery/astra-sol-trial-20261006-223324`에 보존했습니다. `before/`는 당시 내용, `candidate/`는 이번 적용 후보, `candidate-manifest.json`은 활성화한 범위입니다. 미래에 원본이 달라지면 백업 전체를 덮어쓰지 않고 이번 delta만 비교합니다.

- [공식 Subagents 설정](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [공식 Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- 실제 명령·결과·한계: `work/10/6/2026-10-06-finance-astra-sol-trial.md`
