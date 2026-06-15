# 2026-04-11 불필요 파일 정리 1차

## 변경 파일
- `.gitignore`
- `guidedoc/personal_finance_planner_dto_validator_rules_v2_2_c.docx:Zone.Identifier`
- `guidedoc/personal_finance_planner_openapi_documentation_v2_2_c.docx:Zone.Identifier`
- `guidedoc/personal_finance_planner_openapi_documentation_v2_2_c.pdf:Zone.Identifier`
- `guidedoc/personal_finance_planner_qa_case_table_v2_2_c.xlsx:Zone.Identifier`
- `guidedoc/personal_finance_planner_screen_definition_v2_2_a.docx:Zone.Identifier`
- `guidedoc/personal_finance_planner_screen_definition_v2_2_a.pdf:Zone.Identifier`

## 사용 skill
- `work-log-closeout`: `/work` closeout note 형식과 기록 범위를 저장소 관례에 맞추기 위해 사용

## 변경 이유
- root에 생성 산출물과 local-only 보조 폴더가 누적돼 저장소 탐색이 거칠어지고 디스크 사용량도 커져 있었습니다.
- tracked 파일 중에서는 `guidedoc/*:Zone.Identifier`가 Windows 다운로드 메타파일이라 reference 본문이 아닌 dead metadata 상태였습니다.
- 이번 라운드는 코드/기능 변경 없이 local artifact와 dead metadata만 먼저 정리하는 1차 정리로 제한했습니다.

## 핵심 변경
- `.gitignore`에 `CLAUDE.md`, `/.pipeline/`, `/verify/`를 추가해 local-only 보조 파일이 다시 보이지 않도록 했습니다.
- tracked `guidedoc/*:Zone.Identifier` 6개를 삭제하고 원본 `docx/pdf/xlsx/json/yaml`은 그대로 유지했습니다.
- untracked local artifact인 `.next-debug*`, `.next-e2e-3126`, `.next-rawbuild`, `.next-turbo-*`, `out`, `test-results`, `.pipeline`, `verify`, `CLAUDE.md`, `next-env.d.ts`, `*.tsbuildinfo`를 삭제했습니다.
- active `next dev`가 사용 중인 `.next/`는 보수적으로 남겨 두었습니다.

## 검증
- `git status --short`
  - 정리 전 기존 unrelated 변경과 untracked local artifact 범위를 확인했습니다.
- `du -sh .next .next-* out test-results .pipeline verify 2>/dev/null`
  - 정리 전 기준: `.next` 2.9G, `.pipeline` 294M, `out` 32M, `verify` 24K.
- `find guidedoc -maxdepth 1 -name '*:Zone.Identifier' | sort`
  - 정리 전 6개 tracked 메타파일 존재 확인.
- `pnpm cleanup:next-artifacts`
  - 실행됨. 다만 active runtime `dev:1128193, dev:1128194, dev:1128237` 때문에 `.next*` 자동 prune는 skip.
- `ps -fp 1128193,1128194,1128237`
  - 현재 `/home/xpdlqj/code/finance`에서 `node scripts/next_dev_safe.mjs` / `next dev -p 3100`가 실행 중임을 확인.
- `rm -rf .next-debug .next-debug-access-check .next-debug-ds .next-e2e-3126 .next-rawbuild .next-turbo-1773245715 out test-results .pipeline verify CLAUDE.md next-env.d.ts tsconfig.planning.tsbuildinfo tsconfig.tsbuildinfo`
  - active `.next/`를 제외한 local artifact 수동 삭제 완료.
- `git diff --check -- .gitignore guidedoc`
  - 통과.
- `find guidedoc -maxdepth 1 -name '*:Zone.Identifier' | sort`
  - 통과. 결과 비어 있음.
- `du -sh .next .next-* out test-results .pipeline verify 2>/dev/null`
  - 정리 후 `.next`만 2.8G로 남고 나머지 대상은 제거됨.

## 남은 리스크
- `.next/`는 현재 active `next dev` runtime이 사용 중이라 이번 라운드에서 삭제하지 않았습니다. dev 서버 종료 후 `pnpm cleanup:next-artifacts` 또는 `.next` 수동 삭제를 한 번 더 실행하면 local artifact 정리가 완전히 끝납니다.
- worktree에는 이번 정리와 무관한 기존 tracked/untracked 변경이 이미 존재하므로, 다음 라운드에서도 이 정리 범위와 섞이지 않게 주의가 필요합니다.
