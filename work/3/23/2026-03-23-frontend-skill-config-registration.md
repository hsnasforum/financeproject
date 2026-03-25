# 2026-03-23 frontend-skill config registration

## 변경 파일
- `.codex/config.toml`
- `work/3/23/2026-03-23-frontend-skill-config-registration.md`

## 사용 skill
- `finance-skill-routing`: `.codex/config.toml` 변경 라운드에서 붙일 최소 skill 조합을 확인했다.
- `planning-gate-selector`: config 변경에 맞춰 `pnpm multi-agent:guard`와 `git diff --check -- ...`만 최소 검증으로 선택했다.
- `work-log-closeout`: 이번 설정 등록 범위, 실행 검증, 남은 리스크를 `/work` 표준 형식으로 정리했다.

## 변경 이유
- 설치만 되어 있던 전역 `frontend-skill`을 finance repo의 `.codex/config.toml`에도 명시 등록해, repo 설정 기준에서도 사용 가능한 skill 목록으로 관리하려고 했다.

## 핵심 변경
- `.codex/config.toml`의 `[[skills.config]]` 목록에 `/home/xpdlqj/.codex/skills/frontend-skill/SKILL.md`를 `enabled = true`로 추가했다.
- 기존 finance repo 전용 local skill 목록과 agent 설정은 건드리지 않았다.
- `frontend-skill`을 상시 기본 skill로 승격한 것이 아니라, repo config에 명시 등록한 상태로만 추가했다.

## 검증
- 실행:
  - `pnpm multi-agent:guard`
  - `git diff --check -- .codex/config.toml`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 config 등록만 다뤘으므로, `finance-skill-routing` 문서가 `frontend-skill`을 별도 조건부 skill로 직접 언급하지는 않는다.
- 다만 실제 사용성에는 영향이 없고, 시각 중심 작업에서 task trigger나 사용자 명시 요청으로 계속 사용할 수 있다.

## 다음 작업
- 현재로서는 추가 구현이 필요 없다.
- 필요 시 실제 랜딩/브랜디드 UI 라운드에서 `frontend-skill`을 사용하고, 그때 `/work`에 사용 목적과 범위를 함께 남긴다.
