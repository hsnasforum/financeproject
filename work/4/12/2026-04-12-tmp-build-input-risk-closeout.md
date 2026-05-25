# 2026-04-12 tmp build input 리스크 마감

## 변경 파일
- `tsconfig.json`
- `tsconfig.playwright.json`

## 사용 skill
- `work-log-closeout`: 오늘 리스크 해소 라운드의 변경 파일, 검증, 잔여 리스크를 표준 형식으로 정리

## 변경 이유
- 전날 high→middle surface refactor 마감 후 남은 리스크는 `tmp/` 아래의 로컬 감사용 심볼릭 링크가 TypeScript 프로젝트 입력으로 섞여 `pnpm build`를 흔들 수 있다는 점이었습니다.
- 실제로 `tmp/txn-batch-detail-client-audit.tsx`가 build type-check 입력에 들어와 한 차례 실패를 유발한 이력이 있어, 앱 코드가 아니라 TS 프로젝트 입력면 자체를 좁히는 정리가 필요했습니다.

## 핵심 변경
- `tsconfig.json`의 `exclude`에 `tmp/**`를 추가해 root TypeScript 프로젝트에서 로컬 임시 자산과 감사용 링크를 제외했습니다.
- `tsconfig.playwright.json`에도 `exclude: ["tmp/**"]`를 명시해 e2e용 Next/TypeScript 경로에서도 동일한 입력면 축소를 적용했습니다.
- 런타임 코드, route, API, 사용자 문구, storage 계약은 건드리지 않았습니다.
- 검증은 build와 e2e까지 다시 실행해 `tmp` 제외가 실제 게이트에서 부작용 없이 동작하는지 확인했습니다.

## 검증
- `sed -n '1,240p' work/4/11/2026-04-11-high-middle-surface-refactor-closeout.md`
- `sed -n '1,240p' tsconfig.json`
- `sed -n '1,240p' tsconfig.playwright.json`
- `rg -n 'tmp|txn-batch-detail-client-audit|flow-v3-import-to-cashflow-audit' . -g '!node_modules'`
- `git diff --check -- tsconfig.json tsconfig.playwright.json`
- `pnpm build`
  - PASS
- `pnpm e2e:rc`
  - PASS, `22 passed`

## 남은 리스크
- 이번 라운드에서 전날 남겨 둔 `tmp/` build 입력 리스크는 해소했습니다.
- 다만 worktree에는 이번 변경과 무관한 기존 tracked/untracked 변경이 계속 남아 있으니, 다음 라운드에서도 범위 분리를 유지하는 편이 안전합니다.
- `tmp/` 자체는 여전히 운영/백업/리포트 경로에서 실제 데이터 저장에 쓰이고 있으므로, 향후 정리 라운드는 “입력 제외”와 “런타임 데이터 보존”을 함께 보는 방향이 적절합니다.
