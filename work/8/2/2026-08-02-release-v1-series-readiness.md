# 2026-08-02 v1.1.0~v1.4.0 릴리즈 노트 준비도 감사

## 변경 파일

- `docs/releases/financeproject-1.0.5.md`
- `work/8/2/2026-08-02-release-v1-series-readiness.md`
- 외부 변경: GitHub Release [`v1.0.5`](https://github.com/hsnasforum/financeproject/releases/tag/v1.0.5) 본문

## 사용 skill

- `finance-skill-routing`: 릴리즈·문서 작업에 필요한 최소 skill 조합을 선정했습니다.
- `planning-gate-selector`: 문서 전용 변경에 맞는 정적 검증 범위를 정했습니다.
- `github:yeet`: GitHub 게시 선행 조건을 확인했습니다. 로컬 `gh`가 없어 GitHub 커넥터와 로그인된 Chrome 경로를 사용했습니다.
- `chrome:control-chrome`: 로그인된 GitHub Release 목록·본문을 확인하고 회고 노트 링크를 반영했습니다.
- `work-log-closeout`: 외부 변경, 검증 결과와 실제 릴리즈 대기 조건을 기록했습니다.

## 변경 이유

- 사용자가 `v1.1.0`부터 `v1.4.0`까지 릴리즈 노트를 단계적으로 확인할 수 있기를 요청했습니다.
- 기존 네 문서는 실제 릴리즈가 아니라 `v1.0.5`에 이미 포함된 변경을 나눈 회고 구간이므로, 그대로 소급 태그를 만들면 신규 릴리즈처럼 오해할 수 있습니다.
- 현재 release guard는 태그와 `package.json` 버전 일치를 요구하며, 네 회고 endpoint의 package 버전은 모두 `1.0.4`입니다.

## 핵심 변경

- GitHub `v1.0.5` Release 본문에 `v1.1.0`~`v1.4.0` 상세 회고 문서 링크를 각각 추가했습니다.
- 각 링크 앞에 실제 태그·GitHub Release가 아니라는 안내를 유지했습니다.
- 저장소의 공식 `financeproject-1.0.5.md`에도 같은 링크 구간을 추가해 GitHub 본문과 근거 문서를 맞췄습니다.
- 네 회고 범위는 서로 연속·비중복이며 총 351개 커밋이고, 모두 `v1.0.5`의 조상 이력에 포함됨을 확인했습니다.
- `v1.1.0`~`v1.4.0` 태그와 별도 GitHub Release는 생성하지 않았습니다.

## 검증

- 로그인된 GitHub Release 목록: 실제 게시 버전은 `v1.0.0`, `v1.0.3`, `v1.0.4`, `v1.0.5`임을 확인했습니다.
- GitHub compare `v1.0.5...main`: 2개 커밋, 변경 파일은 종료 기록 한 파일뿐임을 확인했습니다.
- GitHub `v1.0.5` 렌더링: 네 회고 링크가 각각 1개씩 노출되고 올바른 `main/docs/releases` 문서를 가리킴을 확인했습니다.
- GitHub `v1.0.5`는 `Latest` 상태를 유지했고, 본문 수정 직전 첨부 자산 3종의 이름이 그대로임을 확인했습니다.
- `git diff --check -- docs/releases/financeproject-1.0.5.md`: PASS
- `rg -n "단계별 회고 노트|financeproject-1\\.[1-4]\\.0\\.md|실제 태그·GitHub Release" docs/releases/financeproject-1.0.5.md`: PASS, 안내 1개와 링크 4개 확인
- `corepack pnpm multi-agent:guard`: PASS
- `pnpm multi-agent:guard`: FAIL, WSL 환경에서 `pnpm` 실행 파일이 없어 `corepack pnpm`으로 재실행했습니다.

## 미실행 검증

- 릴리즈 태그를 만들지 않아 `pnpm release:verify`, desktop artifact build와 Release workflow는 실행하지 않았습니다.
- `v1.1.0`~`v1.4.0` 별도 Release 자산 검증은 실제 릴리즈가 없어 수행 대상이 아닙니다.

## 남은 리스크

- `v1.1.0`~`v1.4.0` 실제 릴리즈는 아직 없습니다. 각 버전은 직전 실제 태그 이후의 새 변경과 별도 package version 커밋이 있어야 합니다.
- 과거 endpoint에 소급 태그를 만들면 버전 불일치로 현재 guard가 실패하거나 과거 workflow가 실행될 수 있으므로 금지합니다.
- 열린 PR #268과 #269는 실제 변경을 포함하지만 draft·diverged 상태여서 현재 `v1.1.0` 후보로 게시할 수 없습니다.
- 루트 worktree는 `origin/main`보다 136개 커밋 뒤에 있고 대규모 미커밋 변경이 있어 릴리즈 입력으로 사용하지 않았습니다.
- 로컬 `gh` CLI가 없어 Release 조회·편집은 GitHub 커넥터와 로그인된 Chrome 세션에 의존했습니다.

## 다음 라운드 우선순위

- `v1.0.5` 이후 실제 사용자 변경을 병합해 `v1.1.0` 후보 범위를 먼저 확정합니다.
- 깨끗한 release worktree에서 `package.json`과 릴리즈 스크립트 기본 버전을 `1.1.0`으로 맞추고 실제 변경분으로 노트를 다시 작성합니다.
- `v1.1.0` 검증·게시가 끝난 뒤에만 동일 절차로 `v1.2.0`, `v1.3.0`, `v1.4.0`을 순차 진행합니다.
