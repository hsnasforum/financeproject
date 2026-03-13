# 2026-03-13 skill routing config alignment

## 변경 파일
- `.codex/config.toml`
- `.codex/skills/finance-skill-routing/SKILL.md`

## 사용 skill
- `skill-creator`: 새 메타 스킬의 이름, 트리거, 본문 범위를 현재 저장소 운영 방식에 맞게 최소 구성으로 정리하는 데 사용
- `work-log-closeout`: 오늘 최신 `/work` 이후 이어진 이번 라운드의 실제 변경과 실제 검증만 `/work` 형식으로 정리하기 위해 사용

## 변경 이유
- 최근 `/work` 분석상 `planning-gate-selector`, `work-log-closeout`는 상시 필요, `route-ssot-check`, `dart-data-source-hardening`은 조건부 필요로 반복 패턴이 분명했지만 `.codex/config.toml`에는 이 구분이 드러나지 않았습니다.
- 스킬 선택 기준을 대화에만 남겨두기보다 로컬 설정과 재사용 가능한 메타 스킬로 함께 남겨 두는 편이 이후 라운드 정합성에 더 안전했습니다.

## 핵심 변경
- `.codex/config.toml`의 skills 블록에 `상시 필요`, `조건부 필요`, `메타` 주석을 추가해 기존 로컬 스킬의 역할 구분이 바로 읽히도록 정리했습니다.
- 새 메타 스킬 `.codex/skills/finance-skill-routing/SKILL.md`를 추가해 이 저장소에서 기본으로 붙일 스킬과 조건부로 더할 스킬을 명시했습니다.
- 새 스킬은 `planning-gate-selector + work-log-closeout`를 기본 조합으로, `route-ssot-check`와 `dart-data-source-hardening`을 조건부 조합으로 고정했습니다.
- 기존 스킬은 제거하지 않았고, 설정상 enabled 상태도 유지했습니다.

## 검증
- `sed -n '1,240p' .codex/config.toml`
- `sed -n '1,240p' /home/xpdlqj/.codex/skills/.system/skill-creator/SKILL.md`
- `rg --files -g 'SKILL.md' .codex`
- `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
- `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
- `sed -n '1,220p' work/3/13/2026-03-13-home-quick-rules-status-followup.md`
- `sed -n '1,220p' .codex/skills/finance-skill-routing/SKILL.md`
- `pnpm multi-agent:guard`
- `git diff --check -- .codex/config.toml .codex/skills/finance-skill-routing/SKILL.md work/3/13/2026-03-13-skill-routing-config-alignment.md`

## 남은 리스크
- 새 `finance-skill-routing`은 메타 스킬이라 실제 제품 코드나 검증 게이트를 바꾸지는 않습니다. 이후 사용자가 이 기준과 다르게 더 세밀한 스킬 조합을 원하면 본문을 다시 조정해야 합니다.
- 현재 `.codex/config.toml`은 로컬 스킬만 등록하므로 `skill-creator`, `skill-installer` 같은 시스템 스킬은 설정 파일에 따로 노출하지 않았습니다.

## 다음 라운드
- 실제 배치에서 새 메타 스킬이 과하게 트리거되거나 누락되는 사례가 나오면 description과 조건부 규칙을 더 좁혀 조정합니다.
- 필요하면 `finance-skill-routing` 내용을 `.codex/config.toml` 주석과 한 번 더 맞춰 드리프트를 줄입니다.
