# 워크트리 대규모 미커밋 변경 정리

## 목적

- 오래된 기준점 위에 누적된 추적 변경과 미추적 자료를 최신 `origin/main` 기준으로 다시 분류한다.
- 유효한 기능·보안·검증 변경만 선택 이식하고, 이미 반영됐거나 재생성 가능한 자료와 회귀 위험이 큰 미완성 변경은 게시 대상에서 제외한다.
- GitHub 게시 전 전체 릴리스 게이트를 통과한 통합 브랜치를 만든다.

## 이번 라운드 완료 항목

1. 원본 상태와 파일 목록을 별도 복구 스냅샷으로 보존하고, 기존 다른 worktree는 정리 범위에서 제외했다.
2. 최신 `origin/main`에서 `codex/worktree-cleanup-20260820` 통합 브랜치를 만들고 유효 변경만 다시 적용했다.
3. agent model·delegation 규칙, SSH 개인키 재유입 방지, news RSS SSRF/압축/크기 제한, 최신 요청 우선 처리, 공통 접근성 dialog, 추천 결과 사용자 namespace, backup/reset 연동, E2E inventory와 production release contract를 보존했다.
4. `deepmerge-ts < 8.0.0` 보안 권고에 대응해 pnpm override를 `8.0.0`으로 고정하고 Prisma 경로의 실제 해석 버전과 audit 결과를 확인했다.
5. 오래된 main 중복본, 로컬 캡처 상태, Playwright 임시 자료, 0바이트 shell 오염, raw 내부 감사본과 위험한 미완성 통합은 게시 대상에서 제외했다.

## 주요 변경 경로

- agent/runtime 규칙: `.codex/`, `AGENTS.md`, `multi_agent.md`, `scripts/run_codex_multi_agent.sh`, `scripts/multi_agent_handoff_guard.mjs`
- 보안·의존성: `.gitignore`, `scripts/security_check.mjs`, `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`
- news hardening: `src/lib/planning/v3/news/`, `src/app/api/planning/v3/news/settings/`, 관련 tests
- UI·요청 동시성: `src/components/ui/AccessibleDialog.tsx`, `src/lib/browser/latestRequest.ts`, 관련 consumer와 tests
- 추천 사용자 범위: `src/app/recommend/`, `src/lib/recommend/`, backup/recovery 경로와 tests
- release/E2E: `scripts/e2e_inventory_check.mjs`, `scripts/quality_gates.mjs`, `scripts/playwright_with_webserver_debug.mjs`, `tests/e2e/`, `docs/release.md`
- 역사 자료: `docs/blog-assets/`와 대응 작업 기록

## 제외한 변경과 근거

- `/ops` allowlist 통합: layout만 보호하고 Server Action entry point가 보호되지 않는 권한 우회 위험 때문에 제외했다.
- Finlife destructive prune: 불완전하거나 비정상인 200 응답을 authoritative inventory로 오판해 상품·즐겨찾기를 삭제할 수 있어 제외했다.
- planning storage fail-closed/profile vault 변경: broad catch 재개방과 평문 재암호화 회귀가 있어 제외했다.
- 오래된 package/workflow/daily-refresh/recommend 모놀리스: 최신 main의 후속 구조와 보안 업데이트를 보존했다.
- `.data/blog-capture-00`, `.playwright-cli`, 임시 worktree 복사본, raw 감사 보고서: 로컬 상태·내부 정보·재생성 산출물이므로 커밋하지 않는다.

## 검증 결과

- `pnpm release:verify`: PASS
  - dependency audit: advisory 0
  - 전체 Vitest: 842 files, 3,128 tests PASS
  - production Next.js build 및 TypeScript: PASS
  - production release contract E2E: 8 PASS
  - route SSOT: 5 files, 11 tests PASS
- `pnpm e2e:rc`: 38 PASS, 조건부 2 SKIP
- `pnpm lint`: PASS
- `pnpm build`: PASS
- `pnpm exec tsc --noEmit`: PASS
- `git diff --check`: PASS
- SSH 개인키/history guard, news feed 보안, 추천 namespace, 접근성 dialog, PostgreSQL readiness 관련 focused tests: PASS

## 사용 skill

- `finance-skill-routing`: 이번 대규모 정리에 필요한 최소 skill 집합 선정
- `planning-gate-selector`: 변경 범위에 맞는 전체 release/E2E/route 검증 결정
- `codex-agent-rules-maintenance`: model profile·delegation·guard 변경 검토
- `dart-data-source-hardening`: DART 최신 요청 우선 처리와 실패 경로 검토
- `planning-v3-batch-contract-narrowing`: transaction batch 계약 변경 범위 제한
- `route-ssot-check`: route와 release 문서 일치 확인
- `work-log-closeout`: 본 종료 기록 작성
- `github:github`: 게시·PR·checks·merge 절차 확인
- `openai-docs`: Codex model 식별자와 agent 설정 근거 확인

## 남은 리스크와 다음 단계

- Prisma `7.9.1`은 아직 취약한 `deepmerge-ts 7.1.5`를 정확히 고정하므로 현재 override가 필요하다. Prisma가 공식 호환 버전을 내면 override를 제거하고 upstream dependency로 전환한다.
- 이 문서 시점에는 로컬 통합과 검증만 완료됐다. 의도한 경로만 명시적으로 커밋한 뒤 push, PR required checks, review/충돌 확인, merge를 완료하고 원본 폴더를 최신 `main`의 clean 상태로 동기화한다.
