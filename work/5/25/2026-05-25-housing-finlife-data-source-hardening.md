# 2026-05-25 housing finlife data source hardening

## 변경 파일
- `.data/finlife_pension_snapshot.json`
- `.env.example`
- `docs/api-utilization-draft.md`
- `docs/dart-rules-quality-report.md`
- `docs/data-freshness-report.md`
- `docs/finlife-sync.md`
- `docs/schema-baselines.json`
- `docs/schema-drift-report.md`
- `scripts/finlife_probe_groups.mjs`
- `scripts/finlife_sync.mjs`
- `scripts/smoke/public-apis-sample.mjs`
- `src/lib/publicApis/providers/housing.ts`
- `tests/finlife-sync-groups.test.ts`
- `tests/housing-provider.test.ts`
- `tests/public-apis-sample-molit.test.ts`
- `work/5/25/2026-05-25-housing-finlife-data-source-hardening.md`

## 사용 skill
- `dart-data-source-hardening`: 외부 공공데이터 403/404, FINLIFE 그룹별 누락, freshness/schema 문서 정합성을 점검했습니다.
- `planning-gate-selector`: 데이터 provider, 스모크 스크립트, sync 스크립트, docs/schema baseline 변경에 맞춰 focused test, e2e:data-sources, verify, build를 선택했습니다.
- `work-log-closeout`: 실제 실패/회복 경로와 남은 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- 현재 `MOLIT_SALES_API_URL`이 상세 매매 API(`RTMSDataSvcAptTradeDev`)를 가리키면, operation은 맞아도 서비스키 권한 문제로 live 응답이 403이었습니다.
- 같은 키는 일반 매매 API(`RTMSDataSvcAptTrade`)에서 200으로 성공해, 벤치마크 계산은 일반 API 재시도로 회복할 수 있었습니다.
- FINLIFE pension snapshot은 공통 예적금 그룹 `020000`으로는 0건이었지만, pension 유효 그룹 `050000,060000`에서는 343개 상품이 확인됐습니다.
- 운영자가 같은 문제를 반복하지 않도록 sync/probe 스크립트와 문서를 업권별 그룹 기준에 맞춰야 했습니다.

## 핵심 변경
- housing sales provider가 상세 매매 API의 401/403/404를 만나면 일반 매매 API base로 재시도하도록 보강했습니다.
- `scripts/smoke/public-apis-sample.mjs`도 `RTMSDataSvcAptTradeDev` base에서 `getRTMSDataSvcAptTradeDev` operation을 사용하도록 맞췄습니다.
- FINLIFE sync가 `FINLIFE_<KIND>_TOPFIN_GRP_LIST`를 공통 `FINLIFE_TOPFIN_GRP_LIST`보다 우선 사용하도록 했고, pension 기본 그룹을 `050000,060000`으로 고정했습니다.
- FINLIFE probe가 pension 그룹도 출력하고 `Recommended FINLIFE_PENSION_TOPFIN_GRP_LIST=050000,060000`을 안내하도록 확장했습니다.
- pension snapshot을 343개 상품, 17888개 옵션, completionRate 100% 상태로 갱신하고 schema baseline을 의도된 계약으로 갱신했습니다.
- env 예시와 운영 문서에 pension 별도 그룹, MOLIT 상세 API 권한 및 일반 API 재시도 동작을 반영했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm finlife:probe` 통과: deposit `020000`, pension `050000,060000`; saving probe는 이번 호출에서 timeout으로 valid group이 비어 있었으나 기존 snapshot과 동기화 검증은 정상
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin FINLIFE_PENSION_TOPFIN_GRP_LIST=050000,060000 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm finlife:sync --kind=pension` 통과: 343 products, 17888 options
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm finlife:sync --kind=pension` 통과: 별도 env 없이 기본 pension 그룹 `050000,060000` 사용
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm freshness:report` 통과: `total=8 fresh=8 stale=0`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm schema:report` 1차 실패: pension 기존 0건 snapshot 메타 제거로 breaking 2건 감지
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm schema:update` 통과: 의도된 pension schema baseline 갱신
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm schema:report` 통과: breaking 0, nonBreaking 0
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node --check scripts/finlife_sync.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node --check scripts/finlife_probe_groups.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node --check scripts/smoke/public-apis-sample.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/finlife-sync-groups.test.ts tests/housing-provider.test.ts tests/public-apis-sample-molit.test.ts tests/warm-if-stale-env.test.ts tests/data-freshness-report.test.ts` 통과: 5 files, 7 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/finlife_sync.mjs scripts/finlife_probe_groups.mjs scripts/smoke/public-apis-sample.mjs src/lib/publicApis/providers/housing.ts tests/finlife-sync-groups.test.ts tests/housing-provider.test.ts tests/public-apis-sample-molit.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec tsc --noEmit` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm e2e:rc:data-sources` 통과: 1 passed, 상세 API 403 뒤 일반 API 재시도 로그 확인
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm verify` 통과: 661 files, 2026 tests, freshness 8/8 fresh, schema drift 0, route guard scan PASS
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과: 254 static pages 생성
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- scripts/finlife_sync.mjs scripts/finlife_probe_groups.mjs scripts/smoke/public-apis-sample.mjs src/lib/publicApis/providers/housing.ts tests/finlife-sync-groups.test.ts tests/housing-provider.test.ts tests/public-apis-sample-molit.test.ts docs/finlife-sync.md docs/api-utilization-draft.md .env.example docs/schema-drift-report.md docs/schema-baselines.json docs/data-freshness-report.md .data/finlife_pension_snapshot.json` 통과

## 남은 리스크
- 상세 매매 API 자체의 403은 여전히 서비스키 권한 또는 활용 신청 상태 문제입니다. 앱은 일반 매매 API로 회복하지만, 상세 API 전용 필드가 필요한 기능을 추가할 때는 별도 승인 확인이 필요합니다.
- `finlife:probe`에서 saving group은 이번 호출에서 timeout이 발생했습니다. 기존 `finlife_saving_snapshot.json`은 fresh이고 이전 동기화는 성공했지만, upstream 지연이 반복되면 probe timeout 또는 재시도 정책을 따로 보강해야 합니다.
- pension snapshot이 343개 상품으로 확장되면서 DB upsert도 함께 수행됐습니다. 로컬 DB 상태가 포함된 검증에는 문제 없었지만, 배포/운영 DB에 반영할 때는 sync 실행 타이밍과 백업을 별도로 관리해야 합니다.
- WSL에서 `[next_dev_safe] Windows localhost bridge disabled: spawn powershell.exe ENOENT` 경고는 계속 발생합니다. WSL 내부 e2e에는 영향이 없었지만 Windows 브라우저 브리지 사용 시 별도 점검 대상입니다.
- 작업트리에는 이번 라운드 외 선행 변경과 미추적 파일이 많이 남아 있습니다. stage 또는 PR 단위 분리는 별도 정리가 필요합니다.

## 다음 라운드
- dirty worktree를 기능 단위로 나눠 stage/PR 후보를 분리합니다.
- saving probe timeout이 재현되는지 확인하고, 필요하면 FINLIFE probe에 timeout 재시도 또는 per-kind 부분 실패 안내를 추가합니다.
- 상세 매매 API가 필요한 화면/필드가 있는지 점검해 일반 API fallback으로 충분한 범위를 문서화합니다.
