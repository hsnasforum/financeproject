# 2026-07-21 Codex 전역 지침 언어 최적화

## 변경 파일

- `C:\Users\HS\.codex\AGENTS.md`
- `work/7/21/2026-07-21-global-agents-language-optimization.md`

## 사용 skill

- `codex-agent-rules-maintenance`: 전역 지침의 의미를 유지하면서 중복을 줄이고 가장 가까운 공통 지침 파일만 수정했습니다.
- `finance-skill-routing`: 규칙 변경에 필요한 최소 skill 조합을 다시 선택했습니다.
- `planning-gate-selector`: 제품 코드가 아닌 운영 지침 변경으로 분류하고 정적 검증과 multi-agent guard만 선택했습니다.
- `work-log-closeout`: 실제 변경과 검증 결과를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유

- 사용자가 전역 지침을 영문과 한글 중 더 효율적인 언어로 혼합 재작성해도 된다고 명시했습니다.
- 도구명과 실행 계약은 짧은 영어 명령형 문장이 더 간결하므로 기존 한글 설명의 의미를 보존한 채 축약했습니다.

## 핵심 변경

- 기존 한글 운영 규칙 6개를 중복 없는 영문 규칙 4개로 통합했습니다.
- 독립 도구 호출과 dependency-free `rg`·`Get-Content` 탐색의 병렬 실행 원칙을 한 문장으로 묶었습니다.
- 수정·테스트·동작 검증·리뷰를 기능 또는 파일 단위로 일괄 처리하도록 명시했습니다.
- `git diff` 일괄 확인 원칙과 복잡한 변경의 즉시 중간 검증 예외를 보존했습니다.
- 전역 파일 크기가 7,720 bytes에서 7,291 bytes로 429 bytes 줄었습니다.

## 검증

- UTF-8 strict decode와 영문 필수 규칙 4개 존재 확인: PASS
- 교체 전 한글 규칙 5개 패턴이 남지 않았는지 확인: PASS
- 전역·저장소 `AGENTS.md` 합산 크기: 24,717 bytes로 기본 32,768 bytes 한도 이내
- `node .\scripts\multi_agent_handoff_guard.mjs`: PASS — `tracked=25`, `coverage=16`
- `git diff --check -- work/7/21/2026-07-21-global-agents-language-optimization.md`: PASS
- 제품 코드가 바뀌지 않아 `pnpm test`, `pnpm lint`, `pnpm build`는 실행하지 않았습니다.

## 남은 리스크

- 변경된 전역 지침은 새 Codex 작업 또는 재시작 후 확실히 적용됩니다.
- 더 가까운 저장소·하위 디렉터리 `AGENTS.md`에 충돌하는 규칙이 있으면 해당 규칙이 우선합니다.
