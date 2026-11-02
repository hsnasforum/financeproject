# 2026-10-07 Finance 멀티 에이전트 handoff·독립 감사 보강

## 목표

최근 Astra Ultra / Sol Max 실제 작업 결과를 기준으로 외부 하네스를 추가하지 않고, 기존 Finance 운영 규칙에 필요한 최소 보강만 적용했다.

## 변경

- `multi_agent.md`
  - 하위 작업 전달을 `GOAL / KNOWN FACTS / SCOPE / DO NOT / DONE WHEN / RETURN` 형식의 짧은 작업 패키지로 명시했다.
  - 전체 대화·저장소 설명·이미 확인한 근거를 반복 전달하지 않고, 통합에 필요한 증거가 빠지거나 충돌할 때만 보완하도록 했다.
  - 반복 실패, 고위험 모호성, 독립 리뷰 충돌, 출시 직전 미해결 판단에서만 쓰는 조건부 독립 감사 모드를 추가했다.
  - 감사자는 최대 3개의 read-only 관점만 필요에 따라 사용하며, 서로의 결론을 보기 전에 판단하고 메인 Astra가 근거를 통합한다. 다수결은 결론 근거로 사용하지 않는다.
- `.codex/skills/finance-skill-routing/SKILL.md`
  - 조건부 독립 감사를 별도 스킬이 아닌 `multi_agent.md` 운영 모드로 라우팅하도록 추가했다.

## 보존

- 메인 `gpt-6-astra / ultra`, 하위 기본 `gpt-6.1-sol / max`, 동시 상한 6, depth 1을 변경하지 않았다.
- 역할 TOML, 제품 코드, runtime/auth, 테스트, package/lockfile, 외부 권한은 변경하지 않았다.
- WebGPT, codex-chatgpt-web, auto-model-router, sol-luna orchestrator 등 외부 하네스를 설치하지 않았다.
- commit, push, deploy, release를 수행하지 않았다.

## 검증

- `.codex/config.toml` TOML parse 및 기존 모델·effort·thread/depth 값 보존 확인: PASS.
- `corepack pnpm multi-agent:guard`: 최종 PASS.
- 대상 파일 `git diff --check`: PASS.
- 최초에는 새 `independent-audit` 스킬 파일을 config에 등록하는 후보를 만들었으나, 프로젝트 guard가 미추적 repository skill 등록을 정확히 차단했다. guard를 완화하거나 index를 staging하지 않고 해당 후보를 제거해 기존 추적 스킬 안의 조건부 운영 모드로 축소했다.
- 앱 제품 동작을 바꾸지 않는 지침/라우팅 변경이므로 전체 build/E2E는 실행하지 않았다.

## 남은 확인

다음 실제 Finance 작업에서 bounded handoff가 중복 컨텍스트·중복 검증을 줄이는지, 조건부 독립 감사가 필요할 때만 발동하는지 관찰한다. 문제가 없으면 같은 최소 원칙만 wowlog에 이식한다.
