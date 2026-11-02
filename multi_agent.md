# Finance 멀티 에이전트 운영 계약

제품·데이터·안전 불변식은 `AGENTS.md`를 따릅니다. 이 문서는 native/CLI의 위임·소유권·검증·인계 계약을 한 곳에 둡니다. 문서와 예시는 실행 권한을 새로 부여하지 않습니다.

## 현재 모델과 실행 경로

2026-10-07 기본 정책입니다. 사본의 config·역할·CLI 설정과 검증 결과는 `work/10/7/2026-10-07-codex-harness-simplification.md`에 기록합니다. 실제 실행 설정은 `.codex/config.toml`, 역할 TOML과 CLI runner에서 확인합니다.

| native 역할 | CLI 대응 | 모델 | effort | sandbox/쓰기 범위 |
| --- | --- | --- | --- | --- |
| 메인 | lead | gpt-6-astra | ultra | 실제 세션 권한; 조정·통합·최종 판단 |
| 기본 subagent | - | gpt-6.1-sol | max | 필요한 독립 작업에만 생성 |
| manager | 없음 | gpt-6.1-sol | max | read-only; 필요할 때만 분업안 반환 |
| analyzer | 없음 | gpt-6.1-sol | max | read-only; 실행 경로·원인 조사 |
| researcher | researcher | gpt-6.1-sol | max | read-only; 공식 근거 조사 |
| tester | validator | gpt-6.1-sol | max | workspace-write; 할당된 격리 검사만 |
| documenter | documenter | gpt-6.1-sol | max | workspace-write; 할당 문서만 |
| planner | planner | gpt-6.1-sol | max | read-only; 최소 설계·완료 조건 |
| developer | implementer | gpt-6.1-sol | max | workspace-write; 소유 구현 파일 |
| reviewer | reviewer | gpt-6.1-sol | max | read-only; 버그·회귀·검증 공백 |

표의 sandbox와 `approval_policy=on-request`는 native TOML 기준입니다. CLI는 역할 prompt를 사용하며 native sandbox를 자동 적용하지 않으므로 실제 세션 권한도 확인합니다. native는 동시 하위 최대 6, depth=1, runtime=1800초이며 상한을 채우지 않습니다. manager도 하위 역할이므로 재위임하지 않습니다. CLI tmux core=3/full=7은 독립 세션으로 각 세션은 `agents.enabled=false`로 추가 위임을 막습니다. 이 세션 수는 native 상한과 별개입니다.

Finance의 기본 프로필은 **품질 우선**입니다. 메인 Astra Ultra가 목표 해석·분해·충돌 해결·통합·최종 완료 판정을 맡고, 독립적으로 나눌 가치가 있는 하위 작업은 Sol 6.1 Max에 맡깁니다. Max 에이전트 수를 채우지 않으며 인계 비용보다 시간·품질 이득이 있을 때만 생성합니다. 이 조합은 프로젝트 선택이며 모든 작업에 대한 OpenAI의 단일 의무 설정으로 표현하지 않습니다.

설정 저장은 실행 중 세션을 바꾸지 않습니다. 실제 model/effort는 실행기 기록으로 확인하고 요청값과 구분합니다. 지원 거부를 조용한 모델 대체나 인증/provider/권한/CLI 변경으로 우회하지 않습니다. CLI의 `CODEX_LEAD_MODEL`, `CODEX_DEMANDING_MODEL`, `CODEX_READ_HEAVY_MODEL`, 대응 `*_EFFORT`는 명시적 override이며 역할 기본값보다 우선합니다.

## 위임과 소유권

기본은 메인 한 명입니다. 인계 비용보다 시간·품질 이득이 있는 독립 조사·구현·검토만 분할하며 manager-first·고정 단계/역할 수를 강제하지 않습니다. CLI full은 일곱 역할이 실제 필요한 경우에만 선택합니다.

위임에는 필요한 사실과 아래 항목만 짧게 전달합니다.

```text
GOAL: 답해야 할 결과
BASELINE: 실제 workspace·revision·기존 delta와 재사용 근거
SCOPE: 읽기/쓰기 경로, 제외 경로, 허용 명령·자원 소유자
DEPENDENCIES: 선행 결과와 대기 조건
DONE WHEN: 관찰 가능한 완료 조건·필요한 검사
RETURN: 역할별 결론과 아래 Handoff 계약
```

- 한 파일·schema·생성물·lockfile·Git index는 한 시점에 한 쓰기 소유자만 맡습니다. 메인도 하위 소유 파일을 동시에 수정하지 않습니다.
- 최종 build/E2E/production smoke/release와 DB·data root·port·`.next` 계열·standalone shadow·browser profile·산출물은 메인 단일 소유입니다. tester는 충돌 없는 작은 재현·타깃 검사만 맡고 제품/테스트/expected result를 임의 수정하지 않습니다.
- read-only 역할은 파일·폴더·`/work`를 만들지 않고 근거를 쓰기 소유자에게 넘깁니다. documenter는 할당 문서만 수정합니다. CLI lead는 구현 파일을 선점하지 않으며 최종 공유 검증은 실제 세션 권한 안에서 실행합니다.
- 관련 source/schema/baseline/package가 바뀌면 이전 결과의 유효성을 확인하거나 필요한 범위만 재검증합니다. 메인이 실제 diff·출력·반영 범위를 대조해 통합하며 필수 선행 검토가 남아 있으면 완료를 선언하지 않습니다.
- timeout/도구/권한/환경 실패는 제품 회귀와 구분합니다. mutation timeout 뒤에는 현재 상태·중복 위험부터 확인합니다. 조건·가설이 같은 재시도는 하지 않습니다.

### 조건부 독립 감사

서로 다른 접근이 반복 실패하거나 인증·금융·데이터 무결성 근거가 모호하거나 리뷰 결론이 충돌할 때만 필요한 read-only 관점을 독립 위임합니다. 같은 기준 사실과 각자의 질문만 전달하고 서로의 결론을 미리 공유하지 않습니다. 메인이 원문·로그·테스트로 충돌과 다음 최소 실험을 판단하며 다수결로 결정하지 않습니다. 감사는 쓰기 권한이나 Astra 자동 선택을 만들지 않습니다.

## 검증 게이트 단일 기준

이번 delta의 실제 위험과 개발 중/마일스톤/출시 단계로 검사합니다. 역할·스킬에 전체 검사 목록을 다시 만들지 않습니다. CI required checks, 약속한 검사와 금융·인증·저장·복원 위험 검증은 유지합니다.

| 단계·영향 | 필요한 범위 |
| --- | --- |
| 개발 중 | 직접 소비 경로까지 `corepack pnpm exec vitest run <관련 테스트>`, 변경 파일 eslint·script 문법; 타입 영향이면 `corepack pnpm typecheck` |
| UI 마일스톤 | 렌더/행동 테스트·실제 화면·키보드/focus/모바일/overflow·정상/빈/실패/stale 동선; 번들 영향이면 build 1회 |
| 금융 계산·추천 | 0/경계/큰 값/누락/날짜·단위·반올림·소비 경로; 공유 엔진이면 통합/회귀 |
| 인증·owner·저장·복원 | 실패/사용자 격리/데이터 보존·왕복; 적용되는 `planning:user-scope:check`, `sec:check`, 저장/복원 통합 |
| route·navigation | 실제 링크 도착·catalog/`planning:ssot:check`; route/import/production bundle 영향이면 build |
| 호환성·migration | 관련 fixture·저장 왕복·`planning:v2:compat`; complete에 포함된 검사 중복 금지 |
| Planning v2 엔진·통합 | 엔진/consumer 검사; 광범위 영향 또는 v2 전체 완료 주장에 `planning:v2:complete` |
| 외부 데이터 | 설정 누락/오류/부분 응답/freshness; 데이터 계약 영향이면 `data:doctor` |
| launcher·runtime | 해당 entrypoint·격리 smoke, 영향에 맞는 build/verify; 실제 사용자 DB/설치본에 자동 실행하지 않음 |
| Codex 하네스 | 변경 형식·TOML/skill·shell/Node 검사, strict config, `multi-agent:guard`, diff 검사; 앱 build/E2E 추가 없음 |
| 출시 | 현재 CI·release 문서의 전체 test/lint/typecheck/build·RC/E2E·보안/호환성/production smoke |

사용자 흐름 E2E는 저장소 wrapper `corepack pnpm e2e:pw <관련 spec> --workers=1 --retries=0`를 사용합니다. 작은 변경마다 전체 test/verify/build/E2E/complete를 실행하지 않고 타깃만으로 영향 경계를 알 수 없을 때 이유를 정해 확대합니다. `verify`가 모든 검사를 대신한다고 가정하지 않습니다.

성공 검사는 source·의존성·lockfile·설정·입력·환경·산출물이 유효하면 재사용합니다. 실패는 새 회귀/기존 실패/환경 실패/미실행으로 나누고 조건이 바뀐 검사만 다시 실행합니다. guard 삭제·assertion 완화·임의 fixture/snapshot 갱신으로 통과시키지 않습니다. 저장소 wrapper를 사용하고 다른 작업자의 process·산출물·데이터를 정리하지 않습니다. live API·실제 desktop install·운영 DB backup/restore·release는 해당 승인과 별도 증거가 필요합니다.

## GitHub 게시 배치

로컬 완료는 응집된 변경·로컬 검증·종료 기록, 게시 배치는 같은 목적·의존성·검증·rollback 경계의 원격 묶음입니다. 기존 10~15개 로컬 항목당 게시 목표는 강제 개수가 아니며 무관한 작업을 채우지 않습니다. 긴급 장애·보안·release/rollback·분기 충돌 위험·사용자 요청이면 더 작게 나눕니다.

- 일반 수정 요청은 commit/push/PR/merge 승인이 아닙니다. 해당 배치를 명시적으로 승인했다면 승인 범위의 commit·push·PR·required checks·허용된 merge까지 반복 승인 없이 수행합니다. push only/draft only/merge 금지가 우선합니다.
- 실제 CI trigger·대상 branch·head/base·diff·review·checks·충돌과 현재 검증 유효성을 확인합니다. force push·admin bypass·branch protection 우회·실패 required check 무시 merge는 하지 않습니다. PR 생성만으로 배치 완료를 선언하지 않고 허용된 merge 결과·commit·checks·URL을 기록합니다.
- billing/quota/runner/권한/원격 CI 장애는 같은 상태에서 push/rerun을 반복하지 않습니다. 게시 대기/원격 검증 대기/merge 차단을 구분하며 독립적인 승인 범위의 로컬 작업만 진행합니다. 조건 해소 시 최신 head/base/checks를 확인하고 같은 승인 범위에서 재개합니다. 대상·범위가 바뀌면 새 승인이 필요합니다.

`.codex/rules/default.rules`의 prompt prefix는 승인 검토를 돕습니다. trusted 프로젝트에서 로드되며 sandbox 밖 실행 정책과 연결됩니다. sandbox 내부 모든 명령, 옵션 앞삽입·복잡한 shell wrapper·다른 Git API 경로를 절대 차단하는 보안 경계로 보장하지 않습니다. 실제 sandbox/approval와 사용자 승인 계약을 함께 지킵니다.

## Handoff와 기록

각 역할은 고유 결과와 함께 다음을 간결하게 반환합니다.

```text
현재 상태·목표 / 기준 workspace·revision
수행 내용·변경 파일 또는 조사 경로 / 핵심 근거·실패 조건
사용 skill (없으면 없음)
실행한 검증·결과 / 미실행 검증·이유
파일·공유 자원 소유권과 해제 / 외부·DB·filesystem 상태 변경
남은 리스크·미확인 / 다음 라운드 또는 필요한 결정
```

사용자에게 전달하는 마일스톤마다 KST 기준 `work/<현재월>/<현재일>/YYYY-MM-DD-<slug>.md` 한 문서에 기록합니다. 형식은 `work/README.md`와 `work-log-closeout`을 참조하며 작은 편집·재시도·내부 인계에는 새 기록을 만들지 않습니다. 최신 관련 기록만 재개 근거로 사용하고 과거 PASS는 당시 사실로 보존합니다. 기록 때문에 임의 stage/commit하지 않습니다.

하네스 변경 시 config·역할·prompt·runner·skill·guard를 같은 정책으로 맞춥니다. guard는 모델/effort, 공통 계약 참조, tracking·skill 경로·worklog 검사를 유지합니다. 설정/정적 검사와 실제 model 실행·제품 검증은 따로 보고합니다.
