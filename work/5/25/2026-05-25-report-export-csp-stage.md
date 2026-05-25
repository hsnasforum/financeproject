# 2026-05-25 report export CSP stage

## 변경 파일
- `public/planning-report-print.js`
- `src/app/api/planning/reports/[runId]/export.html/route.ts`
- `src/app/planning/reports/_lib/standaloneReportArtifacts.ts`
- `src/lib/planning/reports/standaloneHtmlReport.ts`
- `tests/planning-v2-api/reports-export-html-route.test.ts`
- `work/5/25/2026-05-25-report-export-csp-stage.md`

## 사용 skill
- `planning-gate-selector`: report export API route와 standalone HTML renderer 변경에 맞춰 test, lint, build 검증 범위를 정했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 리스크를 종료 기록 형식으로 정리했습니다.

## 변경 이유
- standalone HTML report export가 inline style과 inline print script에 의존하면 CSP를 좁히기 어렵고, 다운로드 HTML에 불필요한 script 실행 표면이 남습니다.
- report export route는 개발 전용 로컬 읽기 guard가 있는 API이지만 HTML 산출물 자체에는 nonce 기반 style 허용과 script 차단 정책이 필요합니다.
- print view는 자동 인쇄 스크립트가 필요하므로 inline script 대신 `public` 정적 파일을 사용해 `script-src 'self'` 범위로만 허용했습니다.

## 핵심 변경
- export HTML 응답에 `content-security-policy` header를 추가했습니다.
- standalone renderer에 `styleNonce`를 전달하고 `<style nonce="...">`로 렌더링하도록 했습니다.
- inline `style=` 속성을 CSS class로 바꿔 `style-src-attr 'none'` 정책과 맞췄습니다.
- print view의 inline `window.print()` script를 `/planning-report-print.js` 정적 파일로 분리했습니다.
- route test가 CSP, nonce style, inline style/script 부재, 외부 print script 사용을 검증하도록 확장했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/worktree_scope.mjs public/planning-report-print.js 'src/app/api/planning/reports/[runId]/export.html/route.ts' src/app/planning/reports/_lib/standaloneReportArtifacts.ts src/lib/planning/reports/standaloneHtmlReport.ts tests/planning-v2-api/reports-export-html-route.test.ts` 통과: 전체 변경 212, 범위 내 5, 범위 밖 207
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- public/planning-report-print.js 'src/app/api/planning/reports/[runId]/export.html/route.ts' src/app/planning/reports/_lib/standaloneReportArtifacts.ts src/lib/planning/reports/standaloneHtmlReport.ts tests/planning-v2-api/reports-export-html-route.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node --check public/planning-report-print.js` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/planning-v2-api/reports-export-html-route.test.ts` 통과: 1 file, 3 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint public/planning-report-print.js 'src/app/api/planning/reports/[runId]/export.html/route.ts' src/app/planning/reports/_lib/standaloneReportArtifacts.ts src/lib/planning/reports/standaloneHtmlReport.ts tests/planning-v2-api/reports-export-html-route.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 첫 실행은 244초 tool timeout으로 결과를 받지 못했습니다. 남은 build 프로세스는 종료되어 있었고, timeout 감시용 wait shell만 남아 있어 정리했습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 재실행 통과: 254 pages 생성
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --cached --check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard` 첫 실행 실패: 최신 `/work` 문서에 `다음 라운드` 섹션이 없어 guard가 차단했습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- sh -lc "git add -- work/5/25/2026-05-25-report-export-csp-stage.md && git diff --cached --check && PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard"` 통과: `latestWorkNote=work/5/25/2026-05-25-report-export-csp-stage.md`

## 남은 리스크
- `script-src 'self'`는 print view에서 자동 인쇄 정적 파일을 허용하기 위한 최소 완화입니다. 다운로드 기본 view는 `script-src 'none'`을 유지합니다.
- 현재 worktree에는 범위 밖 변경 207개가 남아 있으므로 이 묶음은 pathspec stage로만 분리해야 합니다.
- 별도 브라우저 인쇄 다이얼로그 확인은 수행하지 않았습니다. HTML route contract와 build 산출물 기준으로 검증했습니다.

## 다음 라운드
- report deep link/e2e 변경 또는 dev-security runtime 변경 중 하나를 다음 pathspec 묶음으로 분리합니다.
- 범위 밖 dirty 파일이 많으므로 다음 라운드도 `scripts/worktree_scope.mjs`로 변경 범위를 먼저 확인합니다.
