# 2026-03-11 planning ssot guard baseline cleanup

## 변경 파일

- `scripts/planning_ssot_guard.mjs`
- `src/lib/planning/**` 다수 helper/formatter/store/service 파일
- `README.md`
- `docs/planning-v2-maintenance.md`

## 변경 이유

- `planning:ssot:check`의 rounding baseline 예외를 planning 전반에서 제거하고, `calc/**`만 직접 rounding 허용으로 남긴다.
- route 문서 SSOT와 rounding guard를 운영 문서에서도 바로 확인할 수 있게 한다.

## 핵심 변경

- `scripts/planning_ssot_guard.mjs`의 rounding baseline 예외를 단계적으로 줄여 `src/lib/planning/calc/**`만 남겼다.
- `src/lib/planning/**` 전반의 직접 `Math.round`/`Math.floor` 호출을 `roundKrw`, `roundToDigits`, `Math.trunc`로 치환했다.
- `README.md`, `docs/planning-v2-maintenance.md`에 planning SSOT gate와 current-screens gate를 운영 명령으로 기록했다.

## 검증

- `pnpm planning:ssot:check`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

## 남은 리스크

- 이후 `calc/**` 밖에서 직접 `Math.round`/`Math.floor`를 다시 도입하면 `planning:ssot:check`에서 즉시 실패한다.
- worktree에는 planning guard 정리 외에도 대량의 진행 중 변경이 남아 있으므로, 후속 작업은 범위별로 계속 분리해서 보는 편이 안전하다.

## 2026-03-11 current-screens guard follow-up

### 변경 파일

- `tests/planning/catalog/currentScreens.fullRouteSet.test.ts`
- `work/3/11/2026-03-11-planning-ssot-guard-baseline-cleanup.md`

### 변경 이유

- 중단 이후 현재 상태를 복원하면서 `pnpm planning:ssot:check`를 다시 실행하자, 내부 `planning:current-screens:guard`가 build metadata의 `/favicon.ico/route` 표현을 일반 페이지 route로 오인해 실패했다.
- 실제 사용자 경로 SSOT와 무관한 metadata route 표기를 테스트에서 정규화해야 마지막 guard가 안정적으로 닫힌다.

### 핵심 변경

- `currentScreens.fullRouteSet.test.ts`가 build manifest route를 비교 전에 정규화하도록 수정했다.
- `app-path-routes-manifest` 값과 `app-paths-manifest` 키 모두에서 `/page`, `/route` suffix를 제거해 `/favicon.ico/route` 같은 metadata 표현을 기존 제외 목록으로 안전하게 흘려보낸다.

### 검증

- `pnpm planning:ssot:check`

### 남은 리스크

- 이후 다른 metadata asset route(`robots.txt`, `sitemap.xml` 등)가 manifest 형식으로 추가되면, 문서 SSOT 대상인지 metadata 제외 대상인지 같은 테스트에서 계속 명시해야 한다.

## 2026-03-11 interrupted-run resume check

### 변경 파일

- `work/3/11/2026-03-11-planning-ssot-guard-baseline-cleanup.md`

### 변경 이유

- 멀티 에이전트 실행이 중간에 끊긴 뒤, 실제 마지막 완료 지점이 어디인지 다시 확인할 필요가 있었다.
- `planning ssot guard` 정리와 `current-screens` follow-up이 현재 worktree 기준에서도 유효한지 직접 재검증한 결과를 남긴다.

### 핵심 변경

- 코드 추가 수정 없이 최신 진행 지점을 work 로그로만 정리했다.
- 현재 복원된 마지막 완료 지점은 `planning ssot guard baseline cleanup` 이후 `planning:ssot:check`, `typecheck`, `lint`, `build` 재확인 상태다.

### 검증

- `pnpm planning:ssot:check`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

### 남은 리스크

- 이번 이어받기에서는 `pnpm test` 전체를 다시 실행하지 않았다.
- 현재 검증은 PASS지만, worktree 전체에는 이번 축과 별개인 staged/unstaged 변경이 많이 남아 있어 다음 작업에서는 범위를 다시 좁혀 보는 편이 안전하다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
