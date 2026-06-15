# 2026-05-25 finlife probe timeout hardening

## 변경 파일
- `.env.example`
- `docs/dart-rules-quality-report.md`
- `docs/data-freshness-report.md`
- `docs/finlife-sync.md`
- `docs/schema-drift-report.md`
- `scripts/finlife_cli_common.mjs`
- `scripts/finlife_probe_groups.mjs`
- `tests/finlife-cli-diag-retry.test.ts`
- `work/5/25/2026-05-25-finlife-probe-timeout-hardening.md`

## 사용 skill
- `dart-data-source-hardening`: FINLIFE upstream timeout, 부분 실패, freshness 문서 정합성을 점검했습니다.
- `planning-gate-selector`: 운영 스크립트와 데이터 진단 문서 변경에 맞춰 focused test, lint, typecheck, verify를 선택했습니다.
- `work-log-closeout`: 실행한 명령과 남은 운영 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- 직전 라운드에서 `finlife:probe`가 saving group을 한 번 timeout으로 놓쳤습니다.
- 기존 probe는 그룹별 요청이 단발 10초 timeout이라, 일시적 업스트림 지연이 유효 그룹 누락으로 보일 수 있었습니다.
- 운영자가 timeout/retry 값을 조정할 수 있도록 env 예시와 FINLIFE 문서에 설정값을 명시해야 했습니다.

## 핵심 변경
- `fetchJsonWithDiag`에 timeout/네트워크 오류/429/5xx 대상 재시도를 추가했습니다.
- `finlife:probe` 기본 timeout을 20초, 기본 재시도를 1회로 설정하고 실행 로그에 `timeoutMs`와 `retries`를 출력하게 했습니다.
- `FINLIFE_PROBE_TIMEOUT_MS`, `FINLIFE_PROBE_RETRIES`, `FINLIFE_PROBE_GROUP_CANDIDATES`, `FINLIFE_PROBE_DEBUG`를 `.env.example`에 추가했습니다.
- `docs/finlife-sync.md`에 probe timeout/retry 조정 방법과 후보 그룹 제한 방법을 문서화했습니다.
- transient fetch failure는 재시도하고 FINLIFE business error는 재시도하지 않는 회귀 테스트를 추가했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node --check scripts/finlife_cli_common.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node --check scripts/finlife_probe_groups.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/finlife-cli-diag-retry.test.ts tests/finlife-sync-groups.test.ts` 통과: 2 files, 4 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm finlife:probe` 통과: deposit `020000`, saving `020000`, pension `050000,060000`; `timeoutMs=20000 retries=1`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- scripts/finlife_cli_common.mjs scripts/finlife_probe_groups.mjs tests/finlife-cli-diag-retry.test.ts docs/finlife-sync.md .env.example` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/finlife_cli_common.mjs scripts/finlife_probe_groups.mjs tests/finlife-cli-diag-retry.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec tsc --noEmit` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm verify` 통과: 662 files, 2028 tests, schema drift 0, freshness 8/8 fresh, route guard scan PASS

## 남은 리스크
- 이번 라운드는 FINLIFE probe 운영 스크립트 보강이며 Next 앱 런타임 코드는 바꾸지 않았습니다. 그래서 `pnpm build`는 실행하지 않았고, 직전 라운드의 build 통과 이후 앱 코드 변경은 없습니다.
- FINLIFE upstream 지연이 더 길어지면 운영 환경에서 `FINLIFE_PROBE_TIMEOUT_MS` 또는 `FINLIFE_PROBE_RETRIES`를 더 키워야 할 수 있습니다.
- `docs/dart-rules-quality-report.md`, `docs/data-freshness-report.md`, `docs/schema-drift-report.md`는 `pnpm verify` 과정에서 생성 시각이 갱신됐습니다.
- 작업트리에는 이번 라운드 외 선행 변경과 미추적 파일이 많이 남아 있습니다. stage 또는 PR 단위 분리는 별도 정리가 필요합니다.

## 다음 라운드
- dirty worktree를 기능 단위로 나눠 stage/PR 후보를 분리합니다.
- `scripts/finlife_probe_groups.ts`와 실제 실행되는 `.mjs` 스크립트의 역할 차이를 확인해 오래된 TS 진입점 정리 여부를 판단합니다.
- 일반 매매 API fallback으로 충분한 화면 범위를 문서화하고, 상세 API 전용 필드가 필요한 후보 기능을 분리합니다.
