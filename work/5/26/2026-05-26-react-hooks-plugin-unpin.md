# 2026-05-26 React Hooks lint plugin 고정 해소

## 변경 파일
- `package.json`
- `pnpm-lock.yaml`
- `eslint.config.mjs`
- `docs/maintenance.md`
- `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`
- `src/components/DevGitAdminClient.tsx`
- `src/components/FeedbackDetailClient.tsx`
- `src/components/PlanningRunsClient.tsx`
- `src/components/PlanningTrashClient.tsx`
- `src/components/planning/workspace/useWorkspaceRuntimeBundle.ts`
- `work/5/26/2026-05-26-react-hooks-plugin-unpin.md`

## 사용 skill
- `planning-gate-selector`: lint/dependency/React component 변경에 맞춰 `pnpm lint`, targeted tests, `pnpm build`, `pnpm deps:audit`, diff/guard 검증을 선정했습니다.
- `work-log-closeout`: 실제 실행 결과와 남은 React Compiler migration 리스크를 `/work` 표준 섹션으로 정리했습니다.

## 변경 이유
- 직전 의존성 보안 패치에서 `eslint-plugin-react-hooks` 7.1.1이 신규 React Compiler lint를 켜며 `pnpm lint`가 118건 실패해 plugin을 7.0.1로 고정했습니다.
- 현재 `eslint-config-next@16.2.6`의 compatible 범위는 `eslint-plugin-react-hooks@^7.0.0`이고, 최신 7.1.1이 해석되므로 plugin 고정 자체를 제거해 의존성 drift를 줄였습니다.
- 한 번에 대량 refactor가 필요한 `react-hooks/set-state-in-effect`는 명시적으로 보류하고, 나머지 React Compiler lint 오류는 코드 수정으로 제거했습니다.

## 핵심 변경
- `eslint-plugin-react-hooks` override를 제거하고 lockfile을 7.1.1 해석 상태로 갱신했습니다.
- `react-hooks/set-state-in-effect`만 ESLint config에서 명시적으로 보류했습니다.
- `react-hooks/immutability`, `react-hooks/refs`, `react-hooks/preserve-manual-memoization` 오류를 직접 수정했습니다.
- `docs/maintenance.md`에 React Hooks lint 운영 기준을 추가했습니다.
- `react-hooks/set-state-in-effect` 재활성화 진단으로 잔여 113건을 확인했습니다.

## 검증
- `corepack pnpm view eslint-plugin-react-hooks version` PASS: `7.1.1`
- `corepack pnpm install` PASS: `eslint-plugin-react-hooks` override 제거 후 install 및 `prisma generate` 완료
- `corepack pnpm why eslint-plugin-react-hooks` PASS: `eslint-config-next 16.2.6 -> eslint-plugin-react-hooks 7.1.1`
- `corepack pnpm lint` 1차 FAIL: 7.1.1 기준 신규 React Compiler lint 118건 확인
- `corepack pnpm lint` PASS: plugin 7.1.1 해석, `set-state-in-effect` 보류, 나머지 compiler lint 수정 후 통과
- `corepack pnpm test tests/planning/ui/workspaceRuntimeBundle.test.ts tests/planning-v3-batch-center-ui.test.tsx tests/planning-v3-batch-center-api.test.ts tests/planning-v3-batches-api.test.ts` PASS: 4 files / 44 tests
- `corepack pnpm deps:audit` PASS: `No known vulnerabilities found`
- `corepack pnpm exec eslint src tests scripts planning middleware.ts next.config.ts playwright.config.ts postcss.config.mjs prisma.config.ts vitest.config.ts eslint.config.mjs --rule "react-hooks/set-state-in-effect:error" -f json > tmp/eslint-react-hooks-set-state-report.json` INFO: JSON report 기준 `react-hooks/set-state-in-effect` 113건 확인
- `corepack pnpm build` 1차 TIMEOUT: 303초 제한 초과, 결과 미확정
- `corepack pnpm build` PASS: Next.js production build 완료
- `git diff --check` PASS
- `corepack pnpm multi-agent:guard` PASS: 최신 `/work` 문서가 `work/5/26/2026-05-26-react-hooks-plugin-unpin.md`로 인식됨

## 남은 리스크
- `react-hooks/set-state-in-effect`는 아직 113건 남아 있으며, 데이터 로딩/초기화 effect를 대량으로 재구성해야 하므로 별도 React Compiler migration batch가 필요합니다.
- `set-state-in-effect`를 다시 error로 켜는 진단 command는 exit code가 0으로 반환될 수 있어, JSON report의 rule count를 함께 확인해야 합니다.
- 새 커밋을 push하면 PR #24 head SHA가 바뀌므로 GitHub Actions `CI`, `E2E Smoke`를 새 SHA 기준으로 다시 확인해야 합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 변경분을 커밋하고 PR #24에 push한 뒤 새 head SHA 기준 GitHub Actions `CI`, `E2E Smoke`를 확인하겠습니다.
- 원격 검증 통과 후 PR 본문을 최신 SHA 및 검증 결과로 맞추겠습니다.
- 별도 batch에서 `react-hooks/set-state-in-effect` 잔여 113건을 화면/도메인별로 줄이겠습니다.
