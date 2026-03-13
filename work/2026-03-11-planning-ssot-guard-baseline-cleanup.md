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
