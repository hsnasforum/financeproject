# Finance CLI 공통 계약

제품·안전 불변식은 AGENTS.md, 역할별 모델·위임·소유권·검증·Handoff는 multi_agent.md를 따른다. 이번 요청과 실제 할당 범위에 필요한 절만 참조한다.

tmux는 독립 CLI 세션이며 native 역할 TOML을 자동 적용하는 하위 트리가 아니다. model/effort는 runner 인자를 확인한다. agents.enabled=false로 재위임을 막고 역할별 결과를 lead에게 공통 Handoff로 반환한다.
