# 2026-07-21 Codex 전역 지침 전체 언어 재작성

## 변경 파일

- `C:\Users\HS\.codex\AGENTS.md`
- `work/7/21/2026-07-21-global-agents-full-language-rewrite.md`

## 사용 skill

- `codex-agent-rules-maintenance`: 전역 지침의 기존 의미 계약을 인벤토리하고 중복 섹션을 하나의 운영 계약으로 통합했습니다.
- `finance-skill-routing`: 이번 규칙 변경에 필요한 최소 skill 조합을 선택했습니다.
- `planning-gate-selector`: 제품 코드가 아닌 전역 지침 변경으로 분류하고 정적 검사와 multi-agent guard를 선택했습니다.
- `work-log-closeout`: 실제 변경·검증·잔여 적용 조건을 표준 형식으로 기록했습니다.

## 변경 이유

- 사용자가 Codex 전역 지침을 영어와 한글 중 더 효율적인 언어로 혼합 재작성하도록 요청했습니다.
- 시스템 프롬프트는 제품 소유 영역이라 수정하지 않고, Finance 저장소 `AGENTS.md`는 프로젝트 전용 규칙이므로 전역 파일만 수정했습니다.

## 핵심 변경

- 한국어 존댓말과 사용자 응대 뉘앙스는 한글로 유지하고, 실행·검증·권한 계약은 짧은 영어 명령형으로 정리했습니다.
- 기존 `Goal`, `Core principles`, `Success criteria`, `Output`, `Stop rules`의 중복을 9개 역할 중심 섹션으로 통합했습니다.
- 기존 계약 22개를 정적 검색으로 확인하고, 독립 리뷰에서 발견한 중간 검증 규칙의 강도 변경 1건을 원문 의미에 맞게 수정했습니다.
- 전역 파일 크기는 7,291 bytes에서 6,123 bytes로 1,168 bytes 줄었습니다.
- 제품 코드, 저장소 지침, 시스템 프롬프트는 변경하지 않았습니다.

## 검증

- UTF-8 strict decode와 핵심 의미 계약 22개 존재 확인: PASS
- Markdown heading 10개, bullet 40개, 중복 bullet 0개 확인: PASS
- `C:\Users\HS\.codex\AGENTS.override.md` 부재 확인: PASS
- 전역·저장소 `AGENTS.md` 합산 크기: 23,549 bytes로 기본 32,768 bytes 한도 이내
- 독립 reviewer 의미 보존 검토: 수정 권고 1건 반영 후 PASS
- 독립 tester의 전역 파일 UTF-8·구조·크기·핵심 실행어 검사: PASS
- 독립 tester의 저장소 지침 중복 검사: FAIL — 기존 `AGENTS.md` 30행과 163행의 기준일·출처 규칙이 완전히 같으며 이번 전역 범위에서는 수정하지 않았습니다.
- `node .\scripts\multi_agent_handoff_guard.mjs`: PASS — `tracked=25`, `coverage=16`
- `git diff --check -- work/7/21/2026-07-21-global-agents-full-language-rewrite.md`: PASS
- 제품 코드가 바뀌지 않아 `pnpm test`, `pnpm lint`, `pnpm build`는 실행하지 않았습니다.

## 남은 리스크

- 저장소 `AGENTS.md`에는 기존 문구 중복 1건과 전역 진행 업데이트 규칙보다 더 구체적인 30초 업데이트 규칙이 있으나, 이번 전역 재작성 범위에서는 수정하지 않았습니다.
- 더 가까운 저장소 지침이 전역 지침보다 우선하므로 Finance 작업에서는 저장소의 구체적인 업데이트 주기를 따릅니다.
- 변경된 전역 지침은 새 Codex 작업 또는 재시작 후 확실히 적용됩니다.
