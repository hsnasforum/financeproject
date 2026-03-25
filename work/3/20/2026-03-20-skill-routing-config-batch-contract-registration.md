# 2026-03-20 skill-routing config batch contract registration

## 변경 파일
- `.codex/config.toml`
- `work/3/20/2026-03-20-skill-routing-config-batch-contract-registration.md`

## 사용 skill
- `finance-skill-routing`: 새 `planning-v3-batch-contract-narrowing` skill을 config의 조건부 등록 목록과 맞췄다.
- `planning-gate-selector`: config/skill 계열 변경에 맞는 최소 검증으로 `git diff --check`와 `pnpm multi-agent:guard`를 선택했다.
- `work-log-closeout`: 이번 설정 정합성 라운드를 표준 `/work` 형식으로 남겼다.

## 변경 이유
- `finance-skill-routing`에는 이미 `planning-v3-batch-contract-narrowing`을 조건부 skill로 추가했지만, `.codex/config.toml`에는 아직 등록이 없었다.
- 지금 상태도 세션에서는 동작할 수 있지만, 저장소 기준으로는 config와 routing 문서가 어긋나는 드리프트 상태였다.

## 핵심 변경
- `.codex/config.toml`의 조건부 skill 목록에 `planning-v3-batch-contract-narrowing`을 등록했다.
- 기존 `planning-gate-selector`, `work-log-closeout`, `route-ssot-check`, `dart-data-source-hardening`, `finance-skill-routing` 구성은 그대로 유지했다.
- 새 skill이 앞으로는 direct trigger뿐 아니라 repo 설정 기준으로도 같은 조건부 skill 세트 안에 놓이게 맞췄다.

## 검증
- 실행한 검증
  - `git diff --check -- .codex/config.toml work/3/20/2026-03-20-skill-routing-config-batch-contract-registration.md`
  - `pnpm multi-agent:guard`
- 미실행 검증
  - `pnpm lint`
  - `pnpm build`

## 남은 리스크
- `multi-agent:guard`는 config 등록 정합성은 확인하지만, 새 skill이 실제 다음 `N2` 배치에서 자동으로 잘 선택되는지까지 보장하지는 않는다.
- historical `/work` note는 새 skill 등록 이전 기준으로 작성된 상태라, 효과 검증은 다음 planning v3 batch-family 구현 라운드에서 확인해야 한다.

## 다음 라운드 우선순위
- 다음 실제 planning v3 `N2` batch-family 구현 라운드에서 `planning-v3-batch-contract-narrowing`이 config/routing 양쪽 기준으로 자연스럽게 선택되는지 확인한다.
