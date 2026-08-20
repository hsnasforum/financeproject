# 2026-07-11 GPT-5.6 Codex 에이전트 규칙 정비

## 변경 파일

- `AGENTS.md`
- `multi_agent.md`
- `.codex/config.toml`
- `.codex/agents/manager.toml`
- `.codex/agents/analyzer.toml`
- `.codex/agents/planner.toml`
- `.codex/agents/developer.toml`
- `.codex/agents/reviewer.toml`
- `.codex/agents/tester.toml`
- `.codex/agents/researcher.toml`
- `.codex/agents/documenter.toml`
- `.codex/skills/codex-agent-rules-maintenance/SKILL.md`
- `.codex/skills/codex-agent-rules-maintenance/agents/openai.yaml`
- `.codex/skills/finance-skill-routing/SKILL.md`
- `.codex/skills/planning-gate-selector/SKILL.md`
- `scripts/prompts/multi-agent/common.md`
- `scripts/run_codex_multi_agent.sh`
- `scripts/multi_agent_handoff_guard.mjs`
- `work/7/11/2026-07-11-gpt-5-6-codex-agent-rules.md`

## 사용 skill

- `openai-docs`: GPT-5.6 모델, 프롬프팅, AGENTS.md, Subagents, Skills 공식 문서를 우선 확인했다.
- `skill-creator`: `codex-agent-rules-maintenance`를 초기화하고 frontmatter와 UI 메타데이터를 검증했다.
- `finance-skill-routing`: 이번 라운드에 필요한 skill을 메타 설정 변경 범위로 좁혔다.
- `planning-gate-selector`: 에이전트 설정·프롬프트·skill 변경에 맞춰 `pnpm multi-agent:guard`와 정적 검증을 선택했다.
- `codex-agent-rules-maintenance`: 모델 역할 매핑, 공통 프롬프트, 위임 경계, skill 라우팅의 최종 일관성을 점검했다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 미실행 항목, 잔여 리스크를 이 문서에 정리했다.

## 변경 이유

- 저장소의 native 서브에이전트 설정이 `gpt-5.4`에 고정돼 있었고 CLI 멀티에이전트 실행기는 역할별 모델을 지정하지 않았다.
- GPT-5.6은 기본 응답이 더 간결하므로 전역적인 짧은 답 지시보다 필수 산출물 보존 순서를 명시하는 편이 안전하다.
- 읽기 중심 하위 에이전트에는 `gpt-5.6-terra`, 복합 계획·구현·검증·합성 역할에는 명시적 `gpt-5.6-sol`을 쓰는 공식 권고와 현재 계정의 선택 가능 모델을 프로젝트 역할 체계에 함께 반영할 필요가 있었다.
- 기존 `planning-gate-selector`는 본문에 멀티에이전트 검증 규칙이 있었지만 description에 트리거가 없어 암시적 skill 선택이 약했다.

## 핵심 변경

- native 8개 역할을 `gpt-5.6-sol` 또는 `gpt-5.6-terra`로 전환하고 기존 reasoning effort를 기준값으로 보존했다.
- CLI 역할별 모델·effort 기본값과 `CODEX_DEMANDING_MODEL`, `CODEX_READ_HEAVY_MODEL` 재정의 경로를 추가했다.
- `AGENTS.md`와 CLI 공통 프롬프트에 필수 사실·결정·예외·다음 행동·요청 산출물 보존 우선순위를 반영했다.
- 반복 가능한 에이전트 규칙 정비 절차를 `codex-agent-rules-maintenance` skill로 추가하고 skill 라우팅을 연결했다.
- 멀티에이전트 가드가 GPT-5.6 역할 프로필과 설정된 로컬 skill 경로를 검사하도록 보강했다.

## 검증

- `python3 /mnt/c/Users/HS/.codex/skills/.system/skill-creator/scripts/quick_validate.py <skill-dir>`: 신규 skill, `finance-skill-routing`, `planning-gate-selector` 모두 PASS.
- Python `tomllib`으로 `.codex/config.toml`과 `.codex/agents/*.toml` 9개 파싱: PASS.
- `bash -n scripts/run_codex_multi_agent.sh`: PASS.
- `bash scripts/run_codex_multi_agent.sh --help`: PASS, GPT-5.6 모델 기본값과 환경변수 재정의 안내 확인.
- 역할 함수 정적 실행: `lead/planner/implementer/reviewer -> gpt-5.6-sol`, `researcher/validator/documenter -> gpt-5.6-terra` 및 effort 매핑 확인.
- `node --check scripts/multi_agent_handoff_guard.mjs`: PASS.
- `pnpm multi-agent:guard`: PASS (`tracked=25`, `coverage=16`).
- `rg`로 활성 에이전트 규칙의 `gpt-5.4`, `gpt-5.5` 모델 ID와 광범위 간결 지시 검색: 잔존 없음.
- `git diff --check -- AGENTS.md multi_agent.md .codex scripts/prompts/multi-agent scripts/run_codex_multi_agent.sh scripts/multi_agent_handoff_guard.mjs`: PASS.
- `node .../fetch-codex-manual.mjs`: 응답의 `x-content-sha256` 헤더 부재로 2회 실패했고, 공식 OpenAI 웹 문서 조회로 대체했다.
- `codex --version`, `codex features list`: 현재 WindowsApps 실행 파일 접근 거부로 확인하지 못했다.

## 남은 리스크

- 현재 ChatGPT Codex 계정에서 `gpt-5.6` 별칭은 400 오류로 거부됐고, 활성 설정은 지원 목록에 노출된 명시적 `gpt-5.6-sol`과 `gpt-5.6-terra`만 사용하도록 보정했다.
- reasoning effort는 공식 마이그레이션 권고에 따라 기존 값을 보존했으며, 동일 effort와 한 단계 낮은 effort의 품질·지연·비용 비교 평가는 아직 실행하지 않았다.
- 새 skill은 기존 저장소 관례에 맞춰 `.codex/skills`에 두고 `.codex/config.toml`의 절대 경로로 등록했으므로 저장소 위치가 바뀌면 경로 갱신이 필요하다.

## 다음 라운드 우선순위

1. Codex 실행 권한이 정상화되면 `codex --version`, 역할별 모델 선택, 짧은 read-only subagent smoke를 실행한다.
2. 대표 작업으로 현재 effort와 한 단계 낮은 effort를 비교한 뒤 역할별 effort를 조정한다.
