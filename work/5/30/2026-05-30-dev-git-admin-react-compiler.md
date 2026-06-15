# 2026-05-30 Dev Git Admin React Compiler 경고 축소

## 변경 파일
- `src/components/DevGitAdminClient.tsx`
- `work/5/30/2026-05-30-dev-git-admin-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현 라운드의 기본 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 컴포넌트 변경에 맞는 최소 검증 범위를 정했습니다.
- `work-log-closeout`: 실행한 명령과 남은 리스크를 `/work` 형식에 맞춰 기록했습니다.

## 변경 이유
- `/dev/git` 클라이언트의 최초 `execute("status")` 호출이 mount 직후 effect 안에서 상태를 갱신해 `react-hooks/set-state-in-effect` 경고를 만들었습니다.
- 개발자 전용 Git 관리 화면의 API 계약, 버튼 동작, 표시 문구는 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 Git 상태 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 넘겼습니다.
- 컴포넌트 unmount 시 예약된 최초 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- 수동 `status`, `pull`, `push` 실행 흐름과 `/api/dev/git` 요청 payload는 변경하지 않았습니다.
- `/dev/git` 경로와 내부 링크, 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/DevGitAdminClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건.
  - 변경 후: `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn --quiet false -f json -o tmp/eslint-react-hooks-set-state-after-dev-git-admin.json`
  - 전체 잔여 경고: 28건 / 22개 파일.
  - 이번 대상 파일 `src/components/DevGitAdminClient.tsx` 경고 없음.
- `pnpm lint`
  - PASS.
- `git diff --check`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/dev/git`, `/api/dev/git` 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' \) -print`
  - 출력 없음. 임시 Next 산출물 누수 없음.
- `rg -n -e '/dev/git' tests src`
  - `/dev/git` 직접 e2e 테스트 없음 확인. 이번 변경은 경로, 링크, 셀렉터, API 계약을 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 남은 리스크
- 최초 Git 상태 조회 결과가 기존보다 한 macrotask 늦게 반영됩니다.
- 개발자 전용 화면의 실제 Git 명령 성공 여부는 로컬 환경과 권한 상태에 의존합니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/DoctorSummaryCard.tsx`입니다.
