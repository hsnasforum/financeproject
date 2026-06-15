# 2026-05-25 finlife probe entrypoint cleanup

## 변경 파일
- `.env.example`
- `docs/dart-rules-quality-report.md`
- `docs/data-freshness-report.md`
- `docs/finlife-sync.md`
- `docs/schema-drift-report.md`
- `scripts/finlife_cli_common.mjs`
- `scripts/finlife_probe_groups.mjs`
- `scripts/finlife_probe_groups.ts` 삭제
- `src/lib/finlife/probeGroups.ts` 삭제
- `tests/finlife-cli-diag-retry.test.ts`
- `tests/finlife-probe-aggregate.test.ts` 삭제
- `work/5/25/2026-05-25-finlife-probe-entrypoint-cleanup.md`

## 사용 skill
- `dart-data-source-hardening`: FINLIFE probe의 부분 실패, timeout, 운영 문서 정합성을 점검했습니다.
- `planning-gate-selector`: 운영 스크립트, src 파일 삭제, 데이터 진단 문서 갱신 영향에 맞춰 focused test, lint, typecheck, verify, build를 선택했습니다.
- `work-log-closeout`: 실제 실행 명령과 남은 정리 대상을 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- 실제 `package.json`의 `finlife:probe`는 `scripts/finlife_probe_groups.mjs`만 실행합니다.
- 오래된 `scripts/finlife_probe_groups.ts`와 `src/lib/finlife/probeGroups.ts`는 pension, timeout/retry, 최신 추천 env 출력과 맞지 않았습니다.
- 사용되지 않는 중복 진입점을 남기면 운영자가 잘못 실행하거나 향후 probe 계약이 다시 갈라질 수 있어 제거했습니다.

## 핵심 변경
- `scripts/finlife_probe_groups.ts`와 전용 `src/lib/finlife/probeGroups.ts`를 삭제했습니다.
- 해당 전용 집계 테스트 `tests/finlife-probe-aggregate.test.ts`를 삭제했습니다.
- 참조 검색으로 남은 FINLIFE probe 실행 경로가 `package.json`의 `.mjs` 하나뿐임을 확인했습니다.
- 직전 라운드의 `.mjs` timeout/retry 보강과 신규 회귀 테스트는 유지했습니다.
- `verify` 실행으로 freshness/schema/DART 품질 보고서 생성 시각을 최신화했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin rg -n probeGroups src scripts tests docs package.json` 결과 없음
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin rg -n finlife_probe_groups src scripts tests docs package.json` 결과: `package.json`의 `node scripts/finlife_probe_groups.mjs`만 남음
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- scripts/finlife_probe_groups.ts src/lib/finlife/probeGroups.ts tests/finlife-probe-aggregate.test.ts scripts/finlife_cli_common.mjs scripts/finlife_probe_groups.mjs tests/finlife-cli-diag-retry.test.ts docs/finlife-sync.md .env.example` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/finlife-cli-diag-retry.test.ts tests/finlife-sync-groups.test.ts` 통과: 2 files, 4 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/finlife_cli_common.mjs scripts/finlife_probe_groups.mjs tests/finlife-cli-diag-retry.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec tsc --noEmit` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm finlife:probe` 통과: deposit `020000`, saving `020000`, pension `050000,060000`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm verify` 통과: 661 files, 2027 tests, schema drift 0, freshness 8/8 fresh, route guard scan PASS
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과: 254 static pages 생성

## 남은 리스크
- FINLIFE probe 실행 경로는 하나로 정리됐지만, 작업트리에는 이전 라운드와 무관한 선행 변경이 많이 남아 있습니다. stage 또는 PR 단위 분리가 필요합니다.
- `docs/dart-rules-quality-report.md`, `docs/data-freshness-report.md`, `docs/schema-drift-report.md`는 `pnpm verify` 과정에서 생성 시각이 갱신됐습니다.
- MOLIT 상세 매매 API는 여전히 권한/활용 신청 확인이 필요한 외부 상태입니다. 앱은 일반 매매 API fallback으로 회복하지만 상세 전용 필드가 필요한 기능은 별도 분리가 필요합니다.
- WSL에서 Windows localhost bridge 경고가 반복되는 선행 리스크는 아직 별도 해결하지 않았습니다.

## 다음 라운드
- dirty worktree를 기능 단위로 나눠 stage/PR 후보를 분리합니다.
- MOLIT 상세 API fallback으로 충분한 화면 범위를 문서화하고 상세 전용 필드 후보를 분리합니다.
- WSL localhost bridge 경고가 실제 사용자 실행 경로에 영향을 주는지 확인합니다.
